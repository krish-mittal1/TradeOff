"""Pre-trade risk checks."""
from decimal import Decimal
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.risk import RiskLimit


async def enforce_pre_trade_limits(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    quantity: Decimal,
    notional: Decimal,
) -> None:
    limit = (
        await db.execute(select(RiskLimit).where(RiskLimit.user_id == user_id))
    ).scalar_one_or_none()
    if not limit:
        return
    if limit.is_suspended:
        raise HTTPException(status_code=403, detail="Trading is suspended by risk controls")
    if limit.max_position_size is not None and notional > limit.max_position_size:
        raise HTTPException(status_code=400, detail="Order exceeds maximum position size")
    if limit.max_open_orders is not None:
        open_orders = (
            await db.execute(
                select(func.count(Order.id)).where(
                    Order.user_id == user_id,
                    Order.status.in_(("OPEN", "PENDING", "PARTIALLY_FILLED")),
                )
            )
        ).scalar_one()
        if open_orders >= limit.max_open_orders:
            raise HTTPException(status_code=400, detail="Maximum open orders reached")
