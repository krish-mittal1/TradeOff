"""AI Trading Assistant API — real LLM responses via OpenRouter with live market context."""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import current_user_id
from app.db.session import get_db
from app.models.asset import Asset
from app.models.wallet import UserWallet
from app.services import ai_service
from app.services.market_data_service import market_data_service

router = APIRouter()


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str


async def _optional_user_id(request) -> uuid.UUID | None:
    return getattr(request.state, "user_id", None)


def _gather_tickers() -> list[dict]:
    tickers = []
    for tick in market_data_service.all_ticks():
        tickers.append({
            "symbol": tick.symbol,
            "price": tick.price,
            "change_pct": round(float(tick.change_pct_24h), 2),
            "volume": tick.volume_24h or 0,
        })
    return tickers


async def _gather_holdings(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(UserWallet, Asset)
        .join(Asset, UserWallet.asset_id == Asset.id)
        .where(UserWallet.user_id == user_id)
    )
    holdings = []
    for wallet, asset in result.all():
        available = float(wallet.available)
        if available <= 0:
            continue
        tick = market_data_service.get_tick(f"{asset.symbol}USDT")
        price = float(tick.price) if tick else (1.0 if asset.symbol == "USDT" else 0)
        holdings.append({
            "asset": asset.symbol,
            "available": wallet.available,
            "locked": wallet.locked,
            "value_usdt": available * price,
        })
    return holdings


@router.post("/chat", response_model=ChatResponse)
async def ai_chat(
    req: ChatRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    tickers = _gather_tickers()

    holdings = None
    uid = await _optional_user_id(request)
    if uid:
        try:
            holdings = await _gather_holdings(db, uid)
        except Exception:
            pass

    response = await ai_service.chat(
        message=req.message,
        tickers=tickers,
        holdings=holdings,
    )
    return ChatResponse(response=response)


@router.post("/portfolio-analysis")
async def ai_portfolio_analysis(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    holdings = await _gather_holdings(db, user_id)
    tickers = _gather_tickers()
    return await ai_service.portfolio_analysis(holdings=holdings, tickers=tickers)


@router.post("/market-summary")
async def ai_market_summary(pair: str = Query(default="BTCUSDT")):
    tick = market_data_service.get_tick(pair.upper())
    ticker = None
    if tick:
        ticker = {
            "price": tick.price,
            "change_pct": round(float(tick.change_pct_24h), 2),
            "volume": tick.volume_24h or 0,
            "high": tick.high_24h or 0,
            "low": tick.low_24h or 0,
        }
    return await ai_service.market_summary(pair=pair.upper(), ticker=ticker)
