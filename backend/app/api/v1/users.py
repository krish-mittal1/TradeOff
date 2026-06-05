"""User profile, watchlist, favorites, and referral APIs."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import current_user
from app.db.session import get_db
from app.models.asset import TradingPair
from app.models.extra import UserFavorite, Watchlist, WatchlistItem
from app.models.referral import Referral
from app.models.user import ApiKey, User
from app.utils.security import generate_api_key

router = APIRouter()


class ProfileUpdate(BaseModel):
    display_name: str = Field(min_length=2, max_length=100)


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    permissions: dict = Field(default_factory=lambda: {"read": True, "trade": False, "withdraw": False})


@router.get("/me")
async def get_me(user: User = Depends(current_user)):
    return {
        "id": str(user.id), "email": user.email, "display_name": user.display_name,
        "kyc_level": user.kyc_level, "status": user.status, "role": user.role,
        "mfa_enabled": user.mfa_enabled, "referral_code": user.referral_code,
    }


@router.patch("/me")
async def update_me(req: ProfileUpdate, user: User = Depends(current_user)):
    user.display_name = req.display_name.strip()
    return {"display_name": user.display_name}


@router.get("/favorites")
async def get_favorites(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TradingPair.symbol).join(UserFavorite, UserFavorite.trading_pair_id == TradingPair.id)
        .where(UserFavorite.user_id == user.id).order_by(UserFavorite.position)
    )
    return {"favorites": list(result.scalars().all())}


@router.put("/favorites/{symbol}")
async def add_favorite(symbol: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    pair = (await db.execute(select(TradingPair).where(TradingPair.symbol == symbol.upper()))).scalar_one_or_none()
    if not pair:
        raise HTTPException(status_code=404, detail="Trading pair not found")
    existing = await db.get(UserFavorite, {"user_id": user.id, "trading_pair_id": pair.id})
    if not existing:
        db.add(UserFavorite(user_id=user.id, trading_pair_id=pair.id, position=0))
    return {"symbol": pair.symbol, "favorite": True}


@router.delete("/favorites/{symbol}")
async def remove_favorite(symbol: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    pair = (await db.execute(select(TradingPair).where(TradingPair.symbol == symbol.upper()))).scalar_one_or_none()
    if pair:
        existing = await db.get(UserFavorite, {"user_id": user.id, "trading_pair_id": pair.id})
        if existing:
            await db.delete(existing)
    return {"symbol": symbol.upper(), "favorite": False}


@router.get("/referrals")
async def referral_summary(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(func.count(Referral.id), func.coalesce(func.sum(Referral.reward), 0)).where(Referral.referrer_id == user.id)
    )
    count, rewards = result.one()
    return {"referral_code": user.referral_code, "referrals": count, "rewards": str(rewards)}


@router.get("/api-keys")
async def list_api_keys(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    keys = (
        await db.execute(
            select(ApiKey).where(ApiKey.user_id == user.id).order_by(ApiKey.created_at.desc())
        )
    ).scalars().all()
    return {
        "api_keys": [
            {
                "id": str(key.id),
                "name": key.name,
                "key_prefix": key.key_prefix,
                "permissions": key.permissions,
                "is_active": key.is_active,
                "created_at": key.created_at.isoformat(),
                "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
            }
            for key in keys
        ]
    }


@router.post("/api-keys", status_code=201)
async def create_api_key(
    req: ApiKeyCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    key, secret, hashed = generate_api_key()
    api_key = ApiKey(
        user_id=user.id,
        key_hash=hashed,
        key_prefix=key[-8:],
        name=req.name,
        permissions=req.permissions,
    )
    db.add(api_key)
    await db.flush()
    return {
        "id": str(api_key.id),
        "name": api_key.name,
        "key": key,
        "secret": secret,
        "warning": "Store this secret now. It will not be shown again.",
    }


@router.delete("/api-keys/{api_key_id}")
async def revoke_api_key(
    api_key_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    api_key = (
        await db.execute(select(ApiKey).where(ApiKey.id == api_key_id, ApiKey.user_id == user.id))
    ).scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
    api_key.is_active = False
    return {"id": str(api_key.id), "is_active": False}
