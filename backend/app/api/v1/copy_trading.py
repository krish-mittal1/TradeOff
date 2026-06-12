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
    from app.models.asset import TradingPair
    from sqlalchemy import case, literal

    # Get trade stats per user: volume, trade count, and a rough PnL estimate
    # PnL = sum of sell proceeds - sum of buy costs (from taker perspective)
    taker_result = await db.execute(
        select(
            Trade.taker_user_id.label("user_id"),
            func.count(Trade.id).label("trade_count"),
            func.coalesce(func.sum(Trade.quote_quantity), Decimal("0")).label("volume"),
            func.coalesce(
                func.sum(
                    case(
                        (Trade.taker_side == "SELL", Trade.quote_quantity),
                        else_=-Trade.quote_quantity,
                    )
                ),
                Decimal("0"),
            ).label("pnl"),
        )
        .group_by(Trade.taker_user_id)
    )
    taker_rows = {row.user_id: row for row in taker_result.all()}

    result = await db.execute(
        select(User.id, User.display_name)
        .order_by(User.display_name)
        .limit(50)
    )
    users = result.all()

    leaders = []
    for user in users:
        row = taker_rows.get(user.id)
        trades = int(row.trade_count) if row else 0
        volume = float(row.volume) if row else 0.0
        pnl = float(row.pnl) if row else 0.0
        # ROI = pnl / total_buy_cost * 100; approximate with pnl/volume*100 when volume > 0
        roi = round((pnl / volume * 100), 2) if volume > 0 else 0.0
        leaders.append({
            "user_id": str(user.id),
            "display_name": user.display_name,
            "trades": trades,
            "volume": round(volume, 2),
            "pnl": round(pnl, 2),
            "roi": roi,
            "followers": 0,
        })

    # Sort by volume descending
    leaders.sort(key=lambda x: x["volume"], reverse=True)
    return {"leaders": leaders}



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
