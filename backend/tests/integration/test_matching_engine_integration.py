"""Integration tests: matching engine exercised end-to-end in-process."""
import uuid
from decimal import Decimal

from app.core.matching_engine import (
    EngineOrder,
    MatchingEngine,
    OrderSide,
    OrderStatus,
    OrderType,
    TimeInForce,
)


def make_order(side, price, quantity, order_type=OrderType.LIMIT, tif=TimeInForce.GTC, stop_price=None):
    return EngineOrder(
        order_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        trading_pair="BTCUSDT",
        side=side,
        order_type=order_type,
        price=Decimal(price) if price else None,
        quantity=Decimal(quantity),
        time_in_force=tif,
        stop_price=Decimal(stop_price) if stop_price else None,
    )


async def test_limit_order_rests_on_book_when_no_match():
    engine = MatchingEngine("BTCUSDT")
    bid = make_order(OrderSide.BUY, "50000", "0.1")
    result = await engine.process_order(bid)
    assert not result.trades
    assert bid.status == OrderStatus.OPEN


async def test_market_order_rejected_on_empty_book():
    engine = MatchingEngine("BTCUSDT")
    order = make_order(OrderSide.BUY, None, "0.1", order_type=OrderType.MARKET)
    result = await engine.process_order(order)
    assert not result.trades
    assert order.status == OrderStatus.CANCELLED


async def test_full_fill_two_sides():
    engine = MatchingEngine("BTCUSDT")
    ask = make_order(OrderSide.SELL, "60000", "1")
    await engine.process_order(ask)
    bid = make_order(OrderSide.BUY, "60000", "1")
    result = await engine.process_order(bid)
    assert len(result.trades) == 1
    assert result.trades[0].price == Decimal("60000")
    assert ask.status == OrderStatus.FILLED
    assert bid.status == OrderStatus.FILLED


async def test_ioc_cancels_unfilled_remainder():
    engine = MatchingEngine("BTCUSDT")
    ask = make_order(OrderSide.SELL, "100", "0.5")
    await engine.process_order(ask)
    ioc_bid = make_order(OrderSide.BUY, "100", "1", tif=TimeInForce.IOC)
    result = await engine.process_order(ioc_bid)
    assert len(result.trades) == 1
    assert result.trades[0].quantity == Decimal("0.5")
    assert ioc_bid.status == OrderStatus.PARTIALLY_FILLED


async def test_cancel_order():
    engine = MatchingEngine("BTCUSDT")
    ask = make_order(OrderSide.SELL, "100", "1")
    await engine.process_order(ask)
    cancelled = await engine.cancel_order(ask.order_id)
    assert cancelled
    assert ask.status == OrderStatus.CANCELLED
    assert engine.order_book.get_order(ask.order_id) is None


async def test_best_bid_ask_spread():
    engine = MatchingEngine("BTCUSDT")
    await engine.process_order(make_order(OrderSide.BUY, "99", "1"))
    await engine.process_order(make_order(OrderSide.SELL, "101", "1"))
    assert engine.best_bid == Decimal("99")
    assert engine.best_ask == Decimal("101")
    assert engine.order_book.spread == Decimal("2")
