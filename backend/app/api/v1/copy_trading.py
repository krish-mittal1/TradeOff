"""Copy trading leaderboards and follower relationships."""
import uuid
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import current_user_id
from app.db.session import get_db
from app.models.extra import CopyTradingRelation
from app.models.trade import Trade
from app.models.user import User

router = APIRouter()


class FollowRequest(BaseModel):
    allocation_percentage: Decimal = Field(gt=0, le=100)
    max_position_size: Decimal | None = Field(default=None, gt=0)
    stop_loss_percentage: Decimal | None = Field(default=None, gt=0, le=100)


@router.get("/leaderboard")
async def leaderboard(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User.id, User.display_name, func.count(Trade.id).label("trades"), func.coalesce(func.sum(Trade.quote_quantity), 0).label("volume"))
        .join(Trade, (Trade.taker_user_id == User.id) | (Trade.maker_user_id == User.id), isouter=True)
        .group_by(User.id).order_by(func.coalesce(func.sum(Trade.quote_quantity), 0).desc()).limit(50)
    )
    return {"leaders": [
        {"user_id": str(row.id), "display_name": row.display_name, "trades": row.trades, "volume": str(row.volume)}
        for row in result.all()
    ]}


@router.post("/leaders/{leader_id}/follow")
async def follow(
    leader_id: uuid.UUID,
    req: FollowRequest,
    follower_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if leader_id == follower_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    relation = (await db.execute(select(CopyTradingRelation).where(
        CopyTradingRelation.follower_id == follower_id, CopyTradingRelation.leader_id == leader_id
    ))).scalar_one_or_none()
    if not relation:
        relation = CopyTradingRelation(follower_id=follower_id, leader_id=leader_id, allocation_percentage=req.allocation_percentage)
        db.add(relation)
    relation.allocation_percentage = req.allocation_percentage
    relation.max_position_size = req.max_position_size
    relation.stop_loss_percentage = req.stop_loss_percentage
    relation.is_active = True
    return {"leader_id": str(leader_id), "is_active": True}


@router.delete("/leaders/{leader_id}/follow")
async def unfollow(
    leader_id: uuid.UUID,
    follower_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    relation = (await db.execute(select(CopyTradingRelation).where(
        CopyTradingRelation.follower_id == follower_id, CopyTradingRelation.leader_id == leader_id
    ))).scalar_one_or_none()
    if relation:
        relation.is_active = False
    return {"leader_id": str(leader_id), "is_active": False}
