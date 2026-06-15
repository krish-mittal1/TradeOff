"""Admin API endpoints."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import require_admin
from app.db.session import get_db
from app.models.user import User

router = APIRouter(dependencies=[Depends(require_admin)])


class KycUpdateRequest(BaseModel):
    kyc_level: int = Field(ge=0, le=3)


@router.get("/users")
async def admin_get_users(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """List all users (admin only)."""
    offset = (page - 1) * limit
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(offset).limit(limit)
    )
    users = result.scalars().all()

    count_result = await db.execute(select(func.count()).select_from(User))
    total = count_result.scalar()

    return {
        "users": [
            {
                "id": str(u.id),
                "email": u.email,
                "display_name": u.display_name,
                "kyc_level": u.kyc_level,
                "status": u.status,
                "role": u.role,
                "mfa_enabled": u.mfa_enabled,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_login": u.last_login_at.isoformat() if u.last_login_at else None,
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/users/{user_id}")
async def admin_get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a single user by ID (admin only)."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "kyc_level": user.kyc_level,
        "status": user.status,
        "role": user.role,
        "mfa_enabled": user.mfa_enabled,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login": user.last_login_at.isoformat() if user.last_login_at else None,
    }


@router.post("/users/{user_id}/suspend")
async def admin_suspend_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Suspend a user account (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.status == "SUSPENDED":
        raise HTTPException(status_code=400, detail="User is already suspended")
    user.status = "SUSPENDED"
    return {"id": str(user.id), "status": "SUSPENDED"}


@router.post("/users/{user_id}/activate")
async def admin_activate_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Activate a suspended user (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = "ACTIVE"
    return {"id": str(user.id), "status": "ACTIVE"}


@router.patch("/users/{user_id}/kyc")
async def admin_update_kyc(
    user_id: uuid.UUID,
    req: KycUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update a user's KYC level (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.kyc_level = req.kyc_level
    return {"id": str(user.id), "kyc_level": user.kyc_level}


@router.get("/trades")
async def admin_get_trades(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get all executed trades in the exchange (admin only)."""
    from app.models.asset import TradingPair
    from app.models.trade import Trade

    offset = (page - 1) * limit
    query = (
        select(Trade, TradingPair)
        .join(TradingPair, Trade.trading_pair_id == TradingPair.id)
        .order_by(Trade.trade_timestamp.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)
    rows = result.all()

    count_query = select(func.count()).select_from(Trade)
    total = (await db.execute(count_query)).scalar()

    return {
        "trades": [
            {
                "id": str(t.id),
                "pair": tp.symbol,
                "price": str(t.price),
                "quantity": str(t.quantity),
                "quote_quantity": str(t.quote_quantity),
                "taker_side": str(t.taker_side),
                "maker_side": "BUY" if str(t.taker_side) == "SELL" else "SELL",
                "timestamp": int(t.trade_timestamp.timestamp() * 1000),
            }
            for t, tp in rows
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }

