"""User risk controls and pre-trade limits."""
import uuid
from decimal import Decimal
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import current_user_id
from app.db.session import get_db
from app.models.risk import RiskLimit

router = APIRouter()


class RiskLimitUpdate(BaseModel):
    max_position_size: Decimal | None = Field(default=None, gt=0)
    max_open_orders: int | None = Field(default=None, ge=1, le=1000)
    daily_withdrawal_limit: Decimal | None = Field(default=None, gt=0)


@router.get("/limits")
async def get_limits(user_id: uuid.UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    limit = (await db.execute(select(RiskLimit).where(RiskLimit.user_id == user_id))).scalar_one_or_none()
    if not limit:
        limit = RiskLimit(user_id=user_id, max_open_orders=100, daily_withdrawal_limit=Decimal("10000"))
        db.add(limit)
        await db.flush()
    return {
        "max_position_size": str(limit.max_position_size) if limit.max_position_size else None,
        "max_open_orders": limit.max_open_orders,
        "daily_withdrawal_limit": str(limit.daily_withdrawal_limit) if limit.daily_withdrawal_limit else None,
        "is_suspended": limit.is_suspended,
    }


@router.put("/limits")
async def update_limits(
    req: RiskLimitUpdate,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    limit = (await db.execute(select(RiskLimit).where(RiskLimit.user_id == user_id))).scalar_one_or_none()
    if not limit:
        limit = RiskLimit(user_id=user_id)
        db.add(limit)
    for key, value in req.model_dump(exclude_unset=True).items():
        setattr(limit, key, value)
    return await get_limits(user_id, db)
