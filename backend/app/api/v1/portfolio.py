"""Portfolio API endpoints."""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import current_user_id
from app.db.session import get_db
from app.models.asset import Asset
from app.models.trade import Trade
from app.models.wallet import UserWallet
from app.services.market_data_service import market_data_service

router = APIRouter()


# ─── Shared helper ──────────────────────────────────────────────────────────────
async def _build_portfolio_summary(user_id: uuid.UUID, db: AsyncSession) -> dict:
    """Core logic shared by /summary and /allocation."""
    from app.api.v1.trading import get_engine

    result = await db.execute(
        select(UserWallet, Asset).join(Asset, UserWallet.asset_id == Asset.id)
        .where(UserWallet.user_id == user_id)
    )
    wallets_info = result.all()

    total_value_usd = Decimal("0")
    holdings = []
    btc_price = Decimal("0")

    btc_tick = market_data_service.get_tick("BTCUSDT")
    if btc_tick and btc_tick.price:
        btc_price = btc_tick.price
    else:
        engine = get_engine("BTCUSDT")
        if engine.last_price:
            btc_price = engine.last_price

    for wallet, asset in wallets_info:
        total = wallet.available + wallet.locked
        if total <= Decimal("0"):
            continue

        usd_value = Decimal("0")
        if asset.symbol == "USDT":
            usd_value = total
        else:
            try:
                live_tick = market_data_service.get_tick(f"{asset.symbol}USDT")
                if live_tick and live_tick.price:
                    usd_value = total * live_tick.price
                else:
                    engine = get_engine(f"{asset.symbol}USDT")
                    if engine.last_price:
                        usd_value = total * engine.last_price
            except Exception:
                pass

        total_value_usd += usd_value
        holdings.append({
            "asset": asset.symbol,
            "total": str(total),
            "available": str(wallet.available),
            "locked": str(wallet.locked),
            "usd_value": str(usd_value),
            "btc_value": str((usd_value / btc_price).quantize(Decimal("0.00000001"))) if btc_price > 0 else "0",
        })

    # Sort by USD value descending so largest holdings come first
    holdings.sort(key=lambda h: Decimal(h["usd_value"]), reverse=True)

    return {
        "total_balance_usd": str(total_value_usd),
        "total_btc": str((total_value_usd / btc_price).quantize(Decimal("0.00000001"))) if btc_price > 0 else "0",
        "holdings_count": len(holdings),
        "holdings": holdings,
    }


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/summary")
async def get_portfolio_summary(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get portfolio summary with total value and holdings."""
    return await _build_portfolio_summary(user_id, db)


@router.get("/history")
async def get_portfolio_history(
    user_id: uuid.UUID = Depends(current_user_id),
    from_time: int | None = Query(default=None, alias="from"),
    to_time: int | None = Query(default=None, alias="to"),
    interval: str = Query(default="1h", pattern=r"^\d+[mhd]$"),
    db: AsyncSession = Depends(get_db),
):
    """Get portfolio trade volume history over time (hourly buckets)."""
    from_dt = (
        datetime.fromtimestamp(from_time / 1000, tz=timezone.utc)
        if from_time
        else datetime.now(timezone.utc) - timedelta(days=30)
    )
    to_dt = (
        datetime.fromtimestamp(to_time / 1000, tz=timezone.utc)
        if to_time
        else datetime.now(timezone.utc)
    )

    result = await db.execute(
        select(
            func.date_trunc("hour", Trade.trade_timestamp).label("bucket"),
            func.sum(Trade.quote_quantity).label("volume"),
            func.count(Trade.id).label("trade_count"),
        )
        .where(
            (Trade.taker_user_id == user_id) | (Trade.maker_user_id == user_id),
            Trade.trade_timestamp >= from_dt,
            Trade.trade_timestamp <= to_dt,
        )
        .group_by("bucket")
        .order_by("bucket")
    )
    rows = result.all()

    return [
        {
            "timestamp": int(row.bucket.timestamp() * 1000) if row.bucket else 0,
            "volume": str(row.volume) if row.volume else "0",
            "trades": row.trade_count,
        }
        for row in rows
    ]


@router.get("/allocation")
async def get_portfolio_allocation(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get portfolio allocation percentages by asset."""
    summary = await _build_portfolio_summary(user_id, db)
    total = Decimal(summary["total_balance_usd"])

    allocations = []
    for h in summary["holdings"]:
        usd_val = Decimal(h["usd_value"])
        pct = (usd_val / total * 100).quantize(Decimal("0.01")) if total > 0 else Decimal("0")
        allocations.append({
            "asset": h["asset"],
            "percentage": str(pct),
            "percent": float(pct),        # numeric for frontend charts
            "usd_value": h["usd_value"],
            "total": h["total"],
        })

    return {"allocations": allocations, "allocation": allocations}
