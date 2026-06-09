"""Live crypto market data with Binance public WebSocket and simulated fallback."""
from __future__ import annotations

import asyncio
import json
import logging
import random
from dataclasses import dataclass
from decimal import Decimal

from app.realtime.manager import manager

logger = logging.getLogger(__name__)

SUPPORTED_MARKETS = [
    {"symbol": "BTCUSDT", "base": "BTC", "name": "Bitcoin", "seed": Decimal("68429.12")},
    {"symbol": "ETHUSDT", "base": "ETH", "name": "Ethereum", "seed": Decimal("3641.87")},
    {"symbol": "BNBUSDT", "base": "BNB", "name": "BNB", "seed": Decimal("612.40")},
    {"symbol": "SOLUSDT", "base": "SOL", "name": "Solana", "seed": Decimal("172.46")},
    {"symbol": "XRPUSDT", "base": "XRP", "name": "XRP", "seed": Decimal("0.6245")},
    {"symbol": "ADAUSDT", "base": "ADA", "name": "Cardano", "seed": Decimal("0.4518")},
    {"symbol": "DOGEUSDT", "base": "DOGE", "name": "Dogecoin", "seed": Decimal("0.1682")},
    {"symbol": "AVAXUSDT", "base": "AVAX", "name": "Avalanche", "seed": Decimal("41.28")},
    {"symbol": "LINKUSDT", "base": "LINK", "name": "Chainlink", "seed": Decimal("18.74")},
    {"symbol": "DOTUSDT", "base": "DOT", "name": "Polkadot", "seed": Decimal("7.35")},
    {"symbol": "MATICUSDT", "base": "MATIC", "name": "Polygon", "seed": Decimal("0.7124")},
    {"symbol": "LTCUSDT", "base": "LTC", "name": "Litecoin", "seed": Decimal("84.50")},
]


@dataclass
class MarketTick:
    symbol: str
    price: Decimal
    change_pct_24h: Decimal = Decimal("0")
    high_24h: Decimal = Decimal("0")
    low_24h: Decimal = Decimal("0")
    volume_24h: Decimal = Decimal("0")

    def as_payload(self) -> dict:
        return {
            "type": "ticker",
            "symbol": self.symbol,
            "price": str(self.price),
            "change_pct_24h": str(self.change_pct_24h),
            "high_24h": str(self.high_24h),
            "low_24h": str(self.low_24h),
            "volume_24h": str(self.volume_24h),
        }


class MarketDataService:
    def __init__(self) -> None:
        self.ticks: dict[str, MarketTick] = {
            market["symbol"]: MarketTick(
                symbol=market["symbol"],
                price=market["seed"],
                high_24h=market["seed"],
                low_24h=market["seed"],
            )
            for market in SUPPORTED_MARKETS
        }
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    def get_tick(self, symbol: str) -> MarketTick | None:
        return self.ticks.get(symbol.upper())

    def all_ticks(self) -> list[MarketTick]:
        return list(self.ticks.values())

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="market-data-service")

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run(self) -> None:
        while not self._stop.is_set():
            try:
                await self._run_binance()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Binance market stream unavailable, using simulated ticks: %s", exc)
                await self._run_simulated(duration_seconds=30)

    async def _run_binance(self) -> None:
        import websockets

        streams = "/".join(f"{market['symbol'].lower()}@ticker" for market in SUPPORTED_MARKETS)
        url = f"wss://stream.binance.com:9443/stream?streams={streams}"
        async with websockets.connect(url, ping_interval=20, ping_timeout=20) as websocket:
            logger.info("Connected to Binance public market stream")
            while not self._stop.is_set():
                raw = await asyncio.wait_for(websocket.recv(), timeout=60)
                message = json.loads(raw)
                data = message.get("data", {})
                symbol = str(data.get("s", "")).upper()
                if symbol not in self.ticks:
                    continue
                tick = MarketTick(
                    symbol=symbol,
                    price=Decimal(str(data.get("c", self.ticks[symbol].price))),
                    change_pct_24h=Decimal(str(data.get("P", "0"))),
                    high_24h=Decimal(str(data.get("h", "0"))),
                    low_24h=Decimal(str(data.get("l", "0"))),
                    volume_24h=Decimal(str(data.get("v", "0"))),
                )
                await self.update_tick(tick)

    async def _run_simulated(self, *, duration_seconds: int) -> None:
        end_at = asyncio.get_running_loop().time() + duration_seconds
        while not self._stop.is_set() and asyncio.get_running_loop().time() < end_at:
            for current in list(self.ticks.values()):
                drift = Decimal(str(random.uniform(-0.003, 0.003)))
                price = max(Decimal("0.0001"), current.price * (Decimal("1") + drift))
                high = max(current.high_24h or price, price)
                low = min(current.low_24h or price, price)
                tick = MarketTick(
                    symbol=current.symbol,
                    price=price.quantize(Decimal("0.00000001")),
                    change_pct_24h=current.change_pct_24h + (drift * Decimal("100")),
                    high_24h=high,
                    low_24h=low,
                    volume_24h=current.volume_24h,
                )
                await self.update_tick(tick)
            await asyncio.sleep(2)

    async def update_tick(self, tick: MarketTick) -> None:
        self.ticks[tick.symbol] = tick
        payload = tick.as_payload()
        await manager.publish(f"ticker.{tick.symbol}", payload)
        await manager.publish("market.tickers", {"type": "tickers", "tickers": [payload]})


market_data_service = MarketDataService()
