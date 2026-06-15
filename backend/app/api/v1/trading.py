"""Spot trading API with reservation, matching, settlement, and event publication."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import current_user_id, require_api_permission
from app.core.matching_engine import EngineOrder, MatchingEngine, OrderSide, OrderType, TimeInForce
from app.db.session import get_db
from app.events.kafka_producer import get_kafka_producer
from app.models.asset import TradingPair
from app.models.order import Order
from app.models.trade import Trade
from app.observability import ORDERS, TRADES
from app.realtime.manager import manager
from app.services.copy_trading_service import is_copy_order, replicate_leader_limit_order
from app.services.risk_service import enforce_pre_trade_limits
from app.services.wallet_service import release_order_funds, reserve_order_funds, settle_trade

router = APIRouter()
_engines: dict[str, MatchingEngine] = {}


class MarketOrderRequest(BaseModel):
    pair: str
    side: str
    quantity: Decimal = Field(default=Decimal("0"), ge=0)
    quote_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    client_order_id: str | None = Field(default=None, max_length=100)


class LimitOrderRequest(BaseModel):
    pair: str
    side: str
    price: Decimal = Field(gt=0)
    quantity: Decimal = Field(gt=0)
    time_in_force: str = "GTC"
    client_order_id: str | None = Field(default=None, max_length=100)
    iceberg_peak: Decimal | None = Field(default=None, gt=0)


class StopOrderRequest(BaseModel):
    pair: str
    side: str
    stop_price: Decimal = Field(gt=0)
    quantity: Decimal = Field(gt=0)
    price: Decimal | None = Field(default=None, gt=0)
    time_in_force: str = "GTC"


def get_engine(pair: str) -> MatchingEngine:
    if pair not in _engines:
        _engines[pair] = MatchingEngine(pair)
    return _engines[pair]


def normalize_side(side: str) -> OrderSide:
    try:
        return OrderSide(side.upper())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Side must be BUY or SELL") from exc


async def get_pair(db: AsyncSession, symbol: str) -> TradingPair:
    result = await db.execute(
        select(TradingPair).where(TradingPair.symbol == symbol.upper(), TradingPair.is_active.is_(True))
    )
    pair = result.scalar_one_or_none()
    if not pair:
        raise HTTPException(status_code=404, detail="Trading pair not found")
    engine = get_engine(pair.symbol)
    engine.maker_fee = pair.maker_fee
    engine.taker_fee = pair.taker_fee
    return pair


def validate_pair_rules(pair: TradingPair, quantity: Decimal, price: Decimal | None) -> None:
    if quantity < pair.min_qty or quantity > pair.max_qty:
        raise HTTPException(status_code=400, detail=f"Quantity must be between {pair.min_qty} and {pair.max_qty}")
    # Use round-to-zero division to check step alignment, avoiding floating-point modulo issues
    if pair.step_size > 0 and (quantity / pair.step_size) % 1 != 0:
        # Allow a small tolerance for Decimal representation drift
        remainder = quantity % pair.step_size
        if remainder > Decimal("1e-8") and (pair.step_size - remainder) > Decimal("1e-8"):
            raise HTTPException(status_code=400, detail=f"Quantity must be a multiple of {pair.step_size}")
    if price is not None:
        if pair.tick_size > 0:
            remainder = price % pair.tick_size
            if remainder > Decimal("1e-8") and (pair.tick_size - remainder) > Decimal("1e-8"):
                raise HTTPException(status_code=400, detail=f"Price must be a multiple of {pair.tick_size}")
        if price * quantity < pair.min_notional:
            raise HTTPException(status_code=400, detail=f"Minimum notional is {pair.min_notional}")


async def persist_result(
    db: AsyncSession,
    pair: TradingPair,
    engine_order: EngineOrder,
    result,
    *,
    order_type: str,
    client_order_id: str | None = None,
) -> Order:
    # Check if order already exists in the database
    db_order_result = await db.execute(
        select(Order).where(Order.id == engine_order.order_id)
    )
    db_order = db_order_result.scalar_one_or_none()

    if not db_order:
        db_order = Order(
            id=engine_order.order_id,
            user_id=engine_order.user_id,
            trading_pair_id=pair.id,
            side=engine_order.side.value,
            order_type=order_type,
            time_in_force=engine_order.time_in_force.value,
            price=engine_order.price,
            stop_price=engine_order.stop_price,
            quantity=engine_order.quantity,
            filled_quantity=engine_order.filled_quantity,
            quote_quantity=engine_order.quote_quantity,
            iceberg_peak=engine_order.iceberg_peak,
            status=engine_order.status.value,
            client_order_id=client_order_id,
            expires_at=engine_order.expires_at,
        )
        db.add(db_order)
    else:
        db_order.status = engine_order.status.value
        db_order.filled_quantity = engine_order.filled_quantity
        db_order.order_type = order_type
        db_order.version += 1

    await db.flush()

    producer = await get_kafka_producer()
    for executed in result.trades:
        await settle_trade(db, pair=pair, trade=executed)
        db.add(
            Trade(
                id=executed.trade_id,
                trading_pair_id=pair.id,
                taker_order_id=executed.taker_order_id,
                maker_order_id=executed.maker_order_id,
                taker_user_id=executed.taker_user_id,
                maker_user_id=executed.maker_user_id,
                price=executed.price,
                quantity=executed.quantity,
                quote_quantity=executed.quote_quantity,
                taker_fee=executed.taker_fee,
                maker_fee=executed.maker_fee,
                taker_side=executed.taker_side.value,
                trade_timestamp=executed.trade_timestamp,
                created_at=datetime.now(timezone.utc),
            )
        )
        maker_result = await db.execute(select(Order).where(Order.id == executed.maker_order_id))
        maker_db_order = maker_result.scalar_one_or_none()
        if maker_db_order:
            maker_db_order.filled_quantity += executed.quantity
            maker_db_order.status = "FILLED" if maker_db_order.filled_quantity >= maker_db_order.quantity else "PARTIALLY_FILLED"
        await producer.produce_trade(executed, float(executed.taker_fee), float(executed.maker_fee))
        TRADES.labels(pair.symbol).inc()
        await manager.publish(f"trades.{pair.symbol}", {
            "type": "trade", "trade_id": str(executed.trade_id), "price": str(executed.price),
            "quantity": str(executed.quantity), "side": executed.taker_side.value,
            "timestamp": executed.trade_timestamp.isoformat(),
        })

    await producer.produce_order(engine_order)
    ORDERS.labels(pair.symbol, engine_order.side.value, order_type, engine_order.status.value).inc()
    await manager.publish(f"orderbook.{pair.symbol}", {"type": "depth", **get_engine(pair.symbol).get_depth(100)})
    await manager.publish(f"orders.{engine_order.user_id}", {
        "type": "order", "order_id": str(engine_order.order_id), "status": engine_order.status.value,
        "filled_quantity": str(engine_order.filled_quantity),
    })
    await manager.publish(f"wallet.{engine_order.user_id}", {"type": "wallet.updated"})
    if order_type == "LIMIT" and not is_copy_order(client_order_id):
        await replicate_leader_limit_order(
            db=db,
            pair=pair,
            leader_order=db_order,
            get_engine=get_engine,
            persist_result=persist_result,
        )
    return db_order


async def process_triggered_stop_orders(db: AsyncSession, engine: MatchingEngine, pair: TradingPair) -> None:
    """Recursively process triggered stop orders from the engine."""
    while True:
        pending = await engine.get_pending_stop_orders()
        if not pending:
            break
        for stop_engine_order in pending:
            # Get order from database
            result = await db.execute(
                select(Order).where(Order.id == stop_engine_order.order_id).with_for_update()
            )
            db_order = result.scalar_one_or_none()
            if not db_order:
                continue

            # Update DB order status to TRIGGERED
            db_order.status = "TRIGGERED"
            db_order.version += 1
            await db.flush()

            # Publish trigger update
            await manager.publish(f"orders.{db_order.user_id}", {
                "type": "order", "order_id": str(db_order.id), "status": "TRIGGERED",
                "filled_quantity": str(db_order.filled_quantity),
            })

            # Convert stop engine order to standard market/limit order
            original_type = stop_engine_order.order_type
            if original_type == OrderType.STOP_MARKET:
                stop_engine_order.order_type = OrderType.MARKET
                order_type_str = "MARKET"
            elif original_type == OrderType.STOP_LIMIT:
                stop_engine_order.order_type = OrderType.LIMIT
                order_type_str = "LIMIT"
            else:
                continue

            # Process the order in engine
            match_result = await engine.process_order(stop_engine_order)

            # Persist result (which handles trades, settlements, and publications)
            await persist_result(
                db, pair, stop_engine_order, match_result,
                order_type=order_type_str, client_order_id=db_order.client_order_id
            )

            # If order gets filled/cancelled/rejected/expired, release remaining locked funds
            if stop_engine_order.status.value in {"FILLED", "CANCELLED", "REJECTED", "EXPIRED"}:
                await release_order_funds(
                    db, user_id=db_order.user_id, pair=pair, side=db_order.side,
                    remaining_quantity=stop_engine_order.remaining_quantity, price=db_order.price,
                    remaining_quote=None, order_id=db_order.id, fee_rate=pair.taker_fee,
                )


def response_for(order: EngineOrder, result) -> dict:
    return {
        "order_id": str(order.order_id),
        "status": order.status.value,
        "price": str(order.price) if order.price is not None else None,
        "quantity": str(order.quantity),
        "executed_qty": str(order.filled_quantity),
        "remaining_qty": str(order.remaining_quantity),
        "fills": [
            {
                "trade_id": str(t.trade_id),
                "price": str(t.price),
                "qty": str(t.quantity),
                "quote_qty": str(t.quote_quantity),
                "fee": str(t.taker_fee),
            }
            for t in result.trades
        ],
    }


@router.post("/market", status_code=201, dependencies=[Depends(require_api_permission("trade"))])
async def place_market_order(
    req: MarketOrderRequest,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    side = normalize_side(req.side)
    if req.quantity <= 0 and req.quote_quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity or quote_quantity is required")
    if side == OrderSide.BUY and req.quote_quantity <= 0:
        raise HTTPException(status_code=400, detail="Market buys require quote_quantity")
    if side == OrderSide.SELL and req.quantity <= 0:
        raise HTTPException(status_code=400, detail="Market sells require quantity")
    pair = await get_pair(db, req.pair)
    if req.quantity > 0:
        validate_pair_rules(pair, req.quantity, None)

    engine = get_engine(pair.symbol)
    reference_price = engine.best_ask if side == OrderSide.BUY else engine.best_bid
    if not reference_price:
        raise HTTPException(status_code=409, detail="No market liquidity")
    quantity = req.quantity if req.quantity > 0 else req.quote_quantity / reference_price
    await enforce_pre_trade_limits(
        db, user_id=user_id, quantity=quantity, notional=quantity * reference_price
    )
    order_id = uuid.uuid4()
    await reserve_order_funds(
        db, user_id=user_id, pair=pair, side=side.value, quantity=quantity,
        price=reference_price, quote_quantity=req.quote_quantity if req.quote_quantity > 0 else None,
        order_id=order_id, fee_rate=pair.taker_fee,
    )
    order = EngineOrder(
        order_id=order_id, user_id=user_id, trading_pair=pair.symbol, side=side,
        order_type=OrderType.MARKET, quantity=quantity, quote_quantity=req.quote_quantity or None,
    )
    result = await engine.process_order(order)
    await persist_result(db, pair, order, result, order_type="MARKET", client_order_id=req.client_order_id)
    await release_order_funds(
        db, user_id=user_id, pair=pair, side=side.value, remaining_quantity=order.remaining_quantity,
        price=reference_price, remaining_quote=None, order_id=order_id, fee_rate=pair.taker_fee,
    )
    await process_triggered_stop_orders(db, engine, pair)
    return response_for(order, result)


@router.post("/limit", status_code=201, dependencies=[Depends(require_api_permission("trade"))])
async def place_limit_order(
    req: LimitOrderRequest,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    side = normalize_side(req.side)
    pair = await get_pair(db, req.pair)
    validate_pair_rules(pair, req.quantity, req.price)
    await enforce_pre_trade_limits(
        db, user_id=user_id, quantity=req.quantity, notional=req.quantity * req.price
    )
    try:
        tif = TimeInForce(req.time_in_force.upper())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Unsupported time_in_force") from exc

    order_id = uuid.uuid4()
    await reserve_order_funds(
        db, user_id=user_id, pair=pair, side=side.value, quantity=req.quantity,
        price=req.price, quote_quantity=None, order_id=order_id, fee_rate=pair.taker_fee,
    )
    order = EngineOrder(
        order_id=order_id, user_id=user_id, trading_pair=pair.symbol, side=side,
        order_type=OrderType.LIMIT, price=req.price, quantity=req.quantity,
        time_in_force=tif, iceberg_peak=req.iceberg_peak,
    )
    result = await get_engine(pair.symbol).process_order(order)
    await persist_result(db, pair, order, result, order_type="LIMIT", client_order_id=req.client_order_id)
    if order.status.value in {"FILLED", "CANCELLED", "REJECTED", "EXPIRED"}:
        await release_order_funds(
            db, user_id=user_id, pair=pair, side=side.value, remaining_quantity=order.remaining_quantity,
            price=req.price, remaining_quote=None, order_id=order_id, fee_rate=pair.taker_fee,
        )
    await process_triggered_stop_orders(db, get_engine(pair.symbol), pair)
    return response_for(order, result)


@router.post("/stop", status_code=201, dependencies=[Depends(require_api_permission("trade"))])
async def place_stop_order(
    req: StopOrderRequest,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    side = normalize_side(req.side)
    pair = await get_pair(db, req.pair)
    validate_pair_rules(pair, req.quantity, req.price)
    await enforce_pre_trade_limits(
        db,
        user_id=user_id,
        quantity=req.quantity,
        notional=req.quantity * (req.price or req.stop_price),
    )
    if req.price is None and side == OrderSide.BUY:
        reference_price = req.stop_price
    else:
        reference_price = req.price or req.stop_price
    order_id = uuid.uuid4()
    await reserve_order_funds(
        db, user_id=user_id, pair=pair, side=side.value, quantity=req.quantity,
        price=reference_price, quote_quantity=None, order_id=order_id, fee_rate=pair.taker_fee,
    )
    order_type = OrderType.STOP_LIMIT if req.price else OrderType.STOP_MARKET
    order = EngineOrder(
        order_id=order_id, user_id=user_id, trading_pair=pair.symbol, side=side,
        order_type=order_type, price=req.price, stop_price=req.stop_price,
        quantity=req.quantity, time_in_force=TimeInForce(req.time_in_force.upper()),
    )
    result = await get_engine(pair.symbol).process_order(order)
    await persist_result(db, pair, order, result, order_type=order_type.value)
    return response_for(order, result)


@router.get("")
async def get_orders(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
    status: str | None = None,
    pair: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    query = select(Order, TradingPair).join(TradingPair, Order.trading_pair_id == TradingPair.id).where(Order.user_id == user_id)
    if status:
        query = query.where(Order.status == status.upper())
    if pair:
        query = query.where(TradingPair.symbol == pair.upper())

    # Count total before applying offset/limit
    count_query = select(func.count()).select_from(Order).where(Order.user_id == user_id)
    if status:
        count_query = count_query.where(Order.status == status.upper())
    if pair:
        count_query = count_query.join(TradingPair, Order.trading_pair_id == TradingPair.id).where(TradingPair.symbol == pair.upper())
    total = (await db.execute(count_query)).scalar()

    result = await db.execute(query.order_by(Order.created_at.desc()).offset((page - 1) * limit).limit(limit))
    rows = result.all()
    return {
        "orders": [
            {
                "id": str(order.id), "pair": trading_pair.symbol, "side": order.side,
                "type": order.order_type, "price": str(order.price) if order.price else None,
                "quantity": str(order.quantity), "filled_quantity": str(order.filled_quantity),
                "status": order.status, "created_at": order.created_at.isoformat(),
            }
            for order, trading_pair in rows
        ],
        "total": total, "page": page, "limit": limit,
    }


@router.delete("/{order_id}", dependencies=[Depends(require_api_permission("trade"))])
async def cancel_order(
    order_id: uuid.UUID,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order, TradingPair).join(TradingPair, Order.trading_pair_id == TradingPair.id)
        .where(Order.id == order_id, Order.user_id == user_id).with_for_update()
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    order, pair = row
    if order.status not in {"OPEN", "PENDING", "PARTIALLY_FILLED"}:
        raise HTTPException(status_code=400, detail=f"Cannot cancel order in {order.status} state")
    await get_engine(pair.symbol).cancel_order(order.id)
    order.status = "CANCELLED"
    await release_order_funds(
        db, user_id=user_id, pair=pair, side=order.side,
        remaining_quantity=order.quantity - order.filled_quantity, price=order.price,
        remaining_quote=None, order_id=order.id, fee_rate=pair.taker_fee,
    )
    return {"id": str(order.id), "status": order.status}
