"""Copy-trading order replication helpers."""
from __future__ import annotations

import logging
import uuid
from decimal import ROUND_DOWN, Decimal
from typing import Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.matching_engine import EngineOrder, MatchingEngine, OrderSide, OrderType, TimeInForce
from app.models.asset import TradingPair
from app.models.extra import CopyTradingRelation
from app.models.order import Order
from app.services.risk_service import enforce_pre_trade_limits
from app.services.wallet_service import release_order_funds, reserve_order_funds

logger = logging.getLogger(__name__)

COPY_CLIENT_PREFIX = "copy:"

PersistResult = Callable[
    [AsyncSession, TradingPair, EngineOrder, object],
    Awaitable[Order],
]


def is_copy_order(client_order_id: str | None) -> bool:
    return bool(client_order_id and client_order_id.startswith(COPY_CLIENT_PREFIX))


def floor_to_step(quantity: Decimal, step_size: Decimal) -> Decimal:
    if step_size <= 0:
        return quantity
    steps = (quantity / step_size).to_integral_value(rounding=ROUND_DOWN)
    return steps * step_size


def calculate_copy_quantity(
    *,
    leader_quantity: Decimal,
    leader_price: Decimal,
    allocation_percentage: Decimal,
    max_position_size: Decimal | None,
    min_qty: Decimal,
    max_qty: Decimal,
    min_notional: Decimal,
    step_size: Decimal,
) -> Decimal | None:
    """Return a valid follower quantity, or None when the copied order is too small."""
    quantity = leader_quantity * (allocation_percentage / Decimal("100"))
    if max_position_size is not None and leader_price > 0:
        quantity = min(quantity, max_position_size / leader_price)
    quantity = min(quantity, max_qty)
    quantity = floor_to_step(quantity, step_size)
    if quantity < min_qty:
        return None
    if quantity * leader_price < min_notional:
        return None
    return quantity


async def replicate_leader_limit_order(
    *,
    db: AsyncSession,
    pair: TradingPair,
    leader_order: Order,
    get_engine: Callable[[str], MatchingEngine],
    persist_result: Callable[..., Awaitable[Order]],
) -> list[Order]:
    """Mirror a leader limit order for active followers.

    Replication failures are isolated per follower so a leader order is not rolled
    back because one follower lacks balance or violates risk controls.
    """
    if leader_order.order_type != "LIMIT" or leader_order.price is None:
        return []
    if is_copy_order(leader_order.client_order_id):
        return []

    relations = (
        await db.execute(
            select(CopyTradingRelation).where(
                CopyTradingRelation.leader_id == leader_order.user_id,
                CopyTradingRelation.is_active.is_(True),
            )
        )
    ).scalars().all()
    if not relations:
        return []

    copied_orders: list[Order] = []
    side = OrderSide(leader_order.side)
    engine = get_engine(pair.symbol)

    for relation in relations:
        quantity = calculate_copy_quantity(
            leader_quantity=leader_order.quantity,
            leader_price=leader_order.price,
            allocation_percentage=relation.allocation_percentage,
            max_position_size=relation.max_position_size,
            min_qty=pair.min_qty,
            max_qty=pair.max_qty,
            min_notional=pair.min_notional,
            step_size=pair.step_size,
        )
        if quantity is None:
            continue

        follower_order_id = uuid.uuid4()
        client_order_id = f"{COPY_CLIENT_PREFIX}{leader_order.id}:{relation.id}"
        try:
            await enforce_pre_trade_limits(
                db,
                user_id=relation.follower_id,
                quantity=quantity,
                notional=quantity * leader_order.price,
            )
            await reserve_order_funds(
                db,
                user_id=relation.follower_id,
                pair=pair,
                side=side.value,
                quantity=quantity,
                price=leader_order.price,
                quote_quantity=None,
                order_id=follower_order_id,
                fee_rate=pair.taker_fee,
            )
            engine_order = EngineOrder(
                order_id=follower_order_id,
                user_id=relation.follower_id,
                trading_pair=pair.symbol,
                side=side,
                order_type=OrderType.LIMIT,
                price=leader_order.price,
                quantity=quantity,
                time_in_force=TimeInForce(leader_order.time_in_force or "GTC"),
            )
            result = await engine.process_order(engine_order)
            copied_order = await persist_result(
                db,
                pair,
                engine_order,
                result,
                order_type="LIMIT",
                client_order_id=client_order_id,
            )
            if engine_order.status.value in {"FILLED", "CANCELLED", "REJECTED", "EXPIRED"}:
                await release_order_funds(
                    db,
                    user_id=relation.follower_id,
                    pair=pair,
                    side=side.value,
                    remaining_quantity=engine_order.remaining_quantity,
                    price=leader_order.price,
                    remaining_quote=None,
                    order_id=follower_order_id,
                    fee_rate=pair.taker_fee,
                )
            copied_orders.append(copied_order)
        except HTTPException as exc:
            logger.info(
                "Skipping copied order for follower %s from leader order %s: %s",
                relation.follower_id,
                leader_order.id,
                exc.detail,
            )
        except Exception:
            logger.exception(
                "Unexpected copy-trading failure for follower %s from leader order %s",
                relation.follower_id,
                leader_order.id,
            )
    return copied_orders
