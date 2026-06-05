"""Trades API endpoint."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import uuid

from app.db.session import get_db
from app.models.trade import Trade
from app.api.v1.dependencies import current_user_id

router = APIRouter()


@router.get("")
async def get_trades(
    user_id: uuid.UUID = Depends(current_user_id),
    pair: str | None = None,
    from_time: int | None = Query(default=None, alias="from"),
    to_time: int | None = Query(default=None, alias="to"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get trade history for a user."""
    from datetime import datetime, timezone
    from app.models.asset import TradingPair

    offset = (page - 1) * limit
    query = (
        select(Trade, TradingPair)
        .join(TradingPair, Trade.trading_pair_id == TradingPair.id)
        .where((Trade.taker_user_id == user_id) | (Trade.maker_user_id == user_id))
    )

    if pair:
        pair_result = await db.execute(
            select(TradingPair).where(TradingPair.symbol == pair.upper())
        )
        trading_pair = pair_result.scalar_one_or_none()
        if trading_pair:
            query = query.where(Trade.trading_pair_id == trading_pair.id)

    if from_time:
        from_dt = datetime.fromtimestamp(from_time / 1000, tz=timezone.utc)
        query = query.where(Trade.trade_timestamp >= from_dt)
    if to_time:
        to_dt = datetime.fromtimestamp(to_time / 1000, tz=timezone.utc)
        query = query.where(Trade.trade_timestamp <= to_dt)

    query = query.order_by(Trade.trade_timestamp.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    count_query = select(func.count()).select_from(Trade).where(
        (Trade.taker_user_id == user_id) | (Trade.maker_user_id == user_id)
    )
    count_result = await db.execute(count_query)
    total = count_result.scalar()

    return {
        "trades": [
            {
                "id": str(t.id),
                "pair": tp.symbol,
                "price": str(t.price),
                "quantity": str(t.quantity),
                "quote_quantity": str(t.quote_quantity),
                "fee": str(t.taker_fee if t.taker_user_id == user_id else t.maker_fee),
                "role": "taker" if t.taker_user_id == user_id else "maker",
                "side": t.taker_side if t.taker_user_id == user_id else ("BUY" if t.taker_side == "SELL" else "SELL"),
                "timestamp": int(t.trade_timestamp.timestamp() * 1000),
            }
            for t, tp in rows
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }
