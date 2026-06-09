"""Portfolio API endpoints."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid

from app.db.session import get_db
from app.models.wallet import UserWallet
from app.models.asset import Asset
from app.models.trade import Trade
from app.api.v1.dependencies import current_user_id
from app.services.market_data_service import market_data_service

router = APIRouter()


@router.get("/summary")
async def get_portfolio_summary(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get portfolio summary with total value and P&L."""
    from app.api.v1.trading import get_engine
    
    # Get all wallets with asset info
    result = await db.execute(
        select(UserWallet, Asset).join(Asset, UserWallet.asset_id == Asset.id)
        .where(UserWallet.user_id == user_id)
    )
    wallets_info = result.all()
    
    total_value_usd = Decimal("0")
    holdings = []
    btc_price = Decimal("0")
    
    # Try to get BTC price for reference
    engine = get_engine("BTCUSDT")
    if engine.last_price:
        btc_price = engine.last_price
    
    for wallet, asset in wallets_info:
        total = wallet.available + wallet.locked
        if total <= Decimal("0"):
            continue
        
        # Get price from engine if it's a base asset
        usd_value = Decimal("0")
        try:
            live_tick = market_data_service.get_tick(f"{asset.symbol}USDT")
            pair_engine = get_engine(f"{asset.symbol}USDT")
            price = live_tick.price if live_tick else pair_engine.last_price
            if price:
                usd_value = total * price
        except Exception:
            pass
        
        if asset.symbol == "USDT":
            usd_value = total
        
        total_value_usd += usd_value
        
        holdings.append({
            "asset": asset.symbol,
            "total": str(total),
            "available": str(wallet.available),
            "locked": str(wallet.locked),
            "usd_value": str(usd_value),
            "btc_value": str(total / btc_price) if btc_price > 0 else "0",
        })
    
    return {
        "total_balance_usd": str(total_value_usd),
        "total_btc": str(total_value_usd / btc_price) if btc_price > 0 else "0",
        "holdings_count": len(holdings),
        "holdings": holdings,
    }


@router.get("/history")
async def get_portfolio_history(
    user_id: uuid.UUID = Depends(current_user_id),
    from_time: int | None = Query(default=None, alias="from"),
    to_time: int | None = Query(default=None, alias="to"),
    interval: str = Query(default="1h", pattern=r"^\d+[mhd]$"),
    db: AsyncSession = Depends(get_db),
):
    """Get portfolio value history over time."""
    # Simplified - returns trade-based P&L timeline
    from_dt = datetime.fromtimestamp(from_time / 1000, tz=timezone.utc) if from_time else datetime.now(timezone.utc) - timedelta(days=30)
    to_dt = datetime.fromtimestamp(to_time / 1000, tz=timezone.utc) if to_time else datetime.now(timezone.utc)
    
    # Get trades where user was taker
    result = await db.execute(
        select(
            func.date_trunc('hour', Trade.trade_timestamp).label('bucket'),
            func.sum(Trade.quote_quantity).label('volume'),
            func.count(Trade.id).label('trade_count'),
        ).where(
            Trade.taker_user_id == user_id,
            Trade.trade_timestamp >= from_dt,
            Trade.trade_timestamp <= to_dt,
        ).group_by('bucket').order_by('bucket')
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
    from app.api.v1.trading import get_engine
    
    summary = await get_portfolio_summary(user_id, db)
    total = Decimal(summary["total_balance_usd"])
    
    allocations = []
    for h in summary["holdings"]:
        usd_val = Decimal(h["usd_value"])
        pct = (usd_val / total * 100) if total > 0 else Decimal("0")
        allocations.append({
            "asset": h["asset"],
            "percentage": str(pct.quantize(Decimal("0.01"))),
            "percent": str(pct.quantize(Decimal("0.01"))),
            "usd_value": h["usd_value"],
        })
    
    return {"allocations": allocations, "allocation": allocations}
