from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.asset import TradingPair
from app.models.market import Candle
from app.models.trade import Trade
from app.services.market_data_service import market_data_service

router = APIRouter()


@router.get("/candles")
async def get_candles(
    pair: str,
    interval: str = Query(default="1m", pattern=r"^\d+[mhdw]$"),
    from_time: int | None = Query(default=None, alias="from"),
    to_time: int | None = Query(default=None, alias="to"),
    limit: int = Query(default=500, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """Get candlestick data for a trading pair."""
    # Convert from/to to datetime
    from_dt = datetime.fromtimestamp(from_time / 1000, tz=timezone.utc) if from_time else None
    to_dt = datetime.fromtimestamp(to_time / 1000, tz=timezone.utc) if to_time else None

    # Get trading pair
    result = await db.execute(
        select(TradingPair).where(TradingPair.symbol == pair.upper())
    )
    trading_pair = result.scalar_one_or_none()
    if not trading_pair:
        raise HTTPException(status_code=404, detail="Trading pair not found")

    query = select(Candle).where(
        Candle.trading_pair_id == trading_pair.id,
        Candle.interval == interval,
    )
    if from_dt:
        query = query.where(Candle.time >= from_dt)
    if to_dt:
        query = query.where(Candle.time <= to_dt)

    query = query.order_by(Candle.time.desc()).limit(limit)
    result = await db.execute(query)
    candles = result.scalars().all()

    return [
        {
            "time": int(c.time.timestamp() * 1000),
            "open": str(c.open),
            "high": str(c.high),
            "low": str(c.low),
            "close": str(c.close),
            "volume": str(c.volume),
            "quote_volume": str(c.quote_volume),
            "trades_count": c.trades_count,
        }
        for c in reversed(candles)
    ]


@router.get("/depth/{pair}")
async def get_depth(
    pair: str,
    limit: int = Query(default=100, ge=1, le=5000),
):
    """Get order book depth for a trading pair."""
    from app.api.v1.trading import get_engine
    engine = get_engine(pair.upper())
    depth = engine.get_depth(limit=limit)
    return depth


@router.get("/ticker/{pair}")
async def get_ticker(
    pair: str,
    db: AsyncSession = Depends(get_db),
):
    """Get 24-hour ticker for a trading pair."""
    from app.api.v1.trading import get_engine

    pair_result = await db.execute(select(TradingPair).where(TradingPair.symbol == pair.upper()))
    trading_pair = pair_result.scalar_one_or_none()
    if not trading_pair:
        raise HTTPException(status_code=404, detail="Trading pair not found")

    engine = get_engine(pair.upper())
    live_tick = market_data_service.get_tick(pair.upper())
    last_price = live_tick.price if live_tick else engine.last_price
    best_bid = engine.best_bid
    best_ask = engine.best_ask

    # Get 24h stats
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    result = await db.execute(
        select(
            func.sum(Trade.quantity).label("volume"),
            func.sum(Trade.quote_quantity).label("quote_volume"),
            func.max(Trade.price).label("high"),
            func.min(Trade.price).label("low"),
            func.count(Trade.id).label("trades_count"),
        ).where(Trade.trading_pair_id == trading_pair.id, Trade.trade_timestamp >= since)
    )
    stats = result.one()

    # Get open price (24h ago)
    result = await db.execute(
        select(Trade.price).where(
            Trade.trading_pair_id == trading_pair.id,
            Trade.trade_timestamp < since,
        )
        .order_by(Trade.trade_timestamp.desc()).limit(1)
    )
    open_price = result.scalar()

    return {
        "symbol": pair.upper(),
        "price": str(last_price) if last_price else "0",
        "best_bid": str(best_bid) if best_bid else "0",
        "best_ask": str(best_ask) if best_ask else "0",
        "high_24h": str(live_tick.high_24h) if live_tick and live_tick.high_24h else str(stats.high) if stats.high else "0",
        "low_24h": str(live_tick.low_24h) if live_tick and live_tick.low_24h else str(stats.low) if stats.low else "0",
        "volume_24h": str(live_tick.volume_24h) if live_tick else str(stats.volume) if stats.volume else "0",
        "quote_volume_24h": str(stats.quote_volume) if stats.quote_volume else "0",
        "change_24h": str(last_price - open_price) if last_price and open_price else "0",
        "change_pct_24h": str(live_tick.change_pct_24h) if live_tick else str((last_price - open_price) / open_price * 100) if last_price and open_price and open_price > 0 else "0",
    }


@router.get("/trades/{pair}")
async def get_recent_trades(
    pair: str,
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Get recent trades for a trading pair."""
    result = await db.execute(
        select(Trade).join(TradingPair, Trade.trading_pair_id == TradingPair.id)
        .where(TradingPair.symbol == pair.upper())
        .order_by(Trade.trade_timestamp.desc()).limit(limit)
    )
    trades = result.scalars().all()

    return [
        {
            "id": str(t.id),
            "price": str(t.price),
            "qty": str(t.quantity),
            "quote_qty": str(t.quote_quantity),
            "time": int(t.trade_timestamp.timestamp() * 1000),
            "is_buyer_maker": t.taker_side == "SELL",
        }
        for t in trades
    ]


@router.get("/tickers")
async def get_all_tickers(db: AsyncSession = Depends(get_db)):
    """Get 24-hour tickers for all active trading pairs."""
    result = await db.execute(
        select(TradingPair).where(TradingPair.is_active.is_(True))
    )
    pairs = result.scalars().all()

    tickers = []
    for pair in pairs:
        try:
            from app.api.v1.trading import get_engine
            engine = get_engine(pair.symbol)
            live_tick = market_data_service.get_tick(pair.symbol)
            tickers.append({
                "symbol": pair.symbol,
                "price": str(live_tick.price) if live_tick else str(engine.last_price) if engine.last_price else "0",
                "best_bid": str(engine.best_bid) if engine.best_bid else "0",
                "best_ask": str(engine.best_ask) if engine.best_ask else "0",
                "change_pct_24h": str(live_tick.change_pct_24h) if live_tick else "0",
            })
        except Exception:
            tickers.append({
                "symbol": pair.symbol,
                "price": "0",
                "best_bid": "0",
                "best_ask": "0",
            })

    return tickers


@router.get("/pairs")
async def get_trading_pairs(db: AsyncSession = Depends(get_db)):
    """Get all active trading pairs."""
    result = await db.execute(
        select(TradingPair)
        .options(selectinload(TradingPair.base_asset), selectinload(TradingPair.quote_asset))
        .where(TradingPair.is_active.is_(True))
        .order_by(TradingPair.symbol)
    )
    pairs = result.scalars().all()

    return [
        {
            "symbol": p.symbol,
            "base_asset": p.base_asset.symbol if p.base_asset else "",
            "quote_asset": p.quote_asset.symbol if p.quote_asset else "",
            "base_precision": p.base_precision,
            "quote_precision": p.quote_precision,
            "min_qty": str(p.min_qty),
            "max_qty": str(p.max_qty),
            "min_notional": str(p.min_notional),
            "tick_size": str(p.tick_size),
            "step_size": str(p.step_size),
            "maker_fee": str(p.maker_fee),
            "taker_fee": str(p.taker_fee),
            "is_active": p.is_active,
        }
        for p in pairs
    ]
