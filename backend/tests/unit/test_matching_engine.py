from decimal import Decimal
import uuid

import pytest

from app.core.matching_engine import EngineOrder, MatchingEngine, OrderSide, OrderStatus, OrderType, TimeInForce


def order(side, price, quantity, *, order_type=OrderType.LIMIT, tif=TimeInForce.GTC):
    return EngineOrder(
        order_id=uuid.uuid4(), user_id=uuid.uuid4(), trading_pair="BTCUSDT",
        side=side, order_type=order_type, price=Decimal(price) if price else None,
        quantity=Decimal(quantity), time_in_force=tif,
    )


@pytest.mark.asyncio
async def test_price_time_priority_and_partial_fill():
    engine = MatchingEngine("BTCUSDT")
    first = order(OrderSide.SELL, "100", "1")
    second = order(OrderSide.SELL, "100", "1")
    await engine.process_order(first)
    await engine.process_order(second)
    taker = order(OrderSide.BUY, "101", "1.5")
    result = await engine.process_order(taker)
    assert [trade.maker_order_id for trade in result.trades] == [first.order_id, second.order_id]
    assert taker.status == OrderStatus.FILLED
    assert second.status == OrderStatus.PARTIALLY_FILLED


@pytest.mark.asyncio
async def test_fok_does_not_mutate_book_when_not_fillable():
    engine = MatchingEngine("BTCUSDT")
    maker = order(OrderSide.SELL, "100", "1")
    await engine.process_order(maker)
    taker = order(OrderSide.BUY, "100", "2", tif=TimeInForce.FOK)
    result = await engine.process_order(taker)
    assert result.trades == []
    assert taker.status == OrderStatus.CANCELLED
    assert engine.get_depth()["asks"] == [["100", "1"]]


@pytest.mark.asyncio
async def test_market_order_cancels_without_liquidity():
    engine = MatchingEngine("BTCUSDT")
    taker = order(OrderSide.BUY, None, "1", order_type=OrderType.MARKET)
    result = await engine.process_order(taker)
    assert result.trades == []
    assert taker.status == OrderStatus.CANCELLED
