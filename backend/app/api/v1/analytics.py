"""Exchange and user analytics APIs."""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import current_user_id
from app.db.session import get_db
from app.models.order import Order
from app.models.trade import Trade

router = APIRouter()


@router.get("/me")
async def user_analytics(user_id: uuid.UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    trade_stats = (await db.execute(select(
        func.count(Trade.id), func.coalesce(func.sum(Trade.quote_quantity), 0),
    ).where((Trade.taker_user_id == user_id) | (Trade.maker_user_id == user_id)))).one()
    order_stats = (await db.execute(select(func.count(Order.id)).where(Order.user_id == user_id))).scalar()
    return {"trades": trade_stats[0], "trading_volume": str(trade_stats[1]), "orders": order_stats}
