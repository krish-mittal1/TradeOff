"""Unit tests for the matching engine order book."""
import uuid
from decimal import Decimal

from app.core.matching_engine.order_book import OrderBook, PriceLevel
from app.core.matching_engine.orders import (
    EngineOrder,
    OrderSide,
    OrderStatus,
    OrderType,
    TimeInForce,
)


def make_order(side, price, quantity="1"):
    return EngineOrder(
        order_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        trading_pair="BTCUSDT",
        side=side,
        order_type=OrderType.LIMIT,
        price=Decimal(price),
        quantity=Decimal(quantity),
        time_in_force=TimeInForce.GTC,
    )


# ── PriceLevel ────────────────────────────────────────────────────────────────

def test_price_level_add_order_updates_total():
    lvl = PriceLevel(price=Decimal("100"))
    o = make_order(OrderSide.BUY, "100", "2")
    lvl.add_order(o)
    assert lvl.total_quantity == Decimal("2")
    assert lvl.order_count == 1


def test_price_level_remove_order():
    lvl = PriceLevel(price=Decimal("100"))
    o = make_order(OrderSide.BUY, "100", "3")
    lvl.add_order(o)
    lvl.remove_order(o)
    assert lvl.total_quantity == Decimal("0")
    assert lvl.order_count == 0


def test_price_level_pop_best_is_fifo():
    lvl = PriceLevel(price=Decimal("100"))
    o1 = make_order(OrderSide.BUY, "100", "1")
    o2 = make_order(OrderSide.BUY, "100", "2")
    lvl.add_order(o1)
    lvl.add_order(o2)
    popped = lvl.pop_best()
    assert popped.order_id == o1.order_id


def test_price_level_peek_does_not_remove():
    lvl = PriceLevel(price=Decimal("100"))
    o = make_order(OrderSide.BUY, "100", "1")
    lvl.add_order(o)
    assert lvl.peek_best() == o
    assert lvl.order_count == 1


def test_price_level_pop_empty_returns_none():
    lvl = PriceLevel(price=Decimal("100"))
    assert lvl.pop_best() is None


# ── OrderBook ─────────────────────────────────────────────────────────────────

def test_order_book_add_bid_sets_best_bid():
    book = OrderBook("BTCUSDT")
    o = make_order(OrderSide.BUY, "50000")
    book.add_order(o)
    assert book.best_bid == Decimal("50000")


def test_order_book_add_ask_sets_best_ask():
    book = OrderBook("BTCUSDT")
    o = make_order(OrderSide.SELL, "51000")
    book.add_order(o)
    assert book.best_ask == Decimal("51000")


def test_order_book_bids_sorted_descending():
    book = OrderBook("BTCUSDT")
    book.add_order(make_order(OrderSide.BUY, "100"))
    book.add_order(make_order(OrderSide.BUY, "200"))
    book.add_order(make_order(OrderSide.BUY, "150"))
    assert book.bid_prices[0] == Decimal("200")
    assert book.bid_prices[-1] == Decimal("100")


def test_order_book_asks_sorted_ascending():
    book = OrderBook("BTCUSDT")
    book.add_order(make_order(OrderSide.SELL, "300"))
    book.add_order(make_order(OrderSide.SELL, "100"))
    book.add_order(make_order(OrderSide.SELL, "200"))
    assert book.ask_prices[0] == Decimal("100")
    assert book.ask_prices[-1] == Decimal("300")


def test_order_book_remove_order_cleans_empty_level():
    book = OrderBook("BTCUSDT")
    o = make_order(OrderSide.BUY, "100")
    book.add_order(o)
    book.remove_order(o)
    assert book.best_bid is None
    assert Decimal("100") not in book.bids


def test_order_book_pop_best_order_removes_from_book():
    book = OrderBook("BTCUSDT")
    o = make_order(OrderSide.SELL, "100")
    book.add_order(o)
    popped = book.pop_best_order(OrderSide.SELL)
    assert popped.order_id == o.order_id
    assert book.best_ask is None


def test_order_book_get_order_by_id():
    book = OrderBook("BTCUSDT")
    o = make_order(OrderSide.BUY, "100")
    book.add_order(o)
    assert book.get_order(o.order_id) == o


def test_order_book_empty_returns_none_best():
    book = OrderBook("BTCUSDT")
    assert book.best_bid is None
    assert book.best_ask is None
    assert book.spread is None
    assert book.mid_price is None


def test_order_book_spread_and_mid():
    book = OrderBook("BTCUSDT")
    book.add_order(make_order(OrderSide.BUY, "99"))
    book.add_order(make_order(OrderSide.SELL, "101"))
    assert book.spread == Decimal("2")
    assert book.mid_price == Decimal("100")


def test_order_book_depth_format():
    book = OrderBook("BTCUSDT")
    book.add_order(make_order(OrderSide.BUY, "100", "3"))
    book.add_order(make_order(OrderSide.SELL, "101", "2"))
    depth = book.get_depth(limit=10)
    assert "bids" in depth
    assert "asks" in depth
    assert depth["bids"][0] == ["100", "3"]
    assert depth["asks"][0] == ["101", "2"]


def test_order_book_stop_order_registered():
    from app.core.matching_engine.orders import OrderType
    book = OrderBook("BTCUSDT")
    stop_order = EngineOrder(
        order_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        trading_pair="BTCUSDT",
        side=OrderSide.SELL,
        order_type=OrderType.STOP_MARKET,
        quantity=Decimal("1"),
        stop_price=Decimal("90"),
    )
    book.add_stop_order(stop_order)
    assert Decimal("90") in book.stop_sell


def test_order_book_stop_orders_trigger_on_price():
    from app.core.matching_engine.orders import OrderType
    book = OrderBook("BTCUSDT")
    stop_order = EngineOrder(
        order_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        trading_pair="BTCUSDT",
        side=OrderSide.SELL,
        order_type=OrderType.STOP_MARKET,
        quantity=Decimal("1"),
        stop_price=Decimal("90"),
    )
    book.add_stop_order(stop_order)
    triggered = book.check_stop_orders(Decimal("85"))  # price dropped below stop
    assert stop_order in triggered
    assert Decimal("90") not in book.stop_sell


def test_order_book_snapshot_has_required_keys():
    book = OrderBook("BTCUSDT")
    snap = book.get_snapshot()
    assert "pair" in snap
    assert "bids" in snap
    assert "asks" in snap
    assert "sequence" in snap


# ── EngineOrder helpers ────────────────────────────────────────────────────────

def test_engine_order_remaining_quantity():
    o = make_order(OrderSide.BUY, "100", "5")
    o.fill(Decimal("2"))
    assert o.remaining_quantity == Decimal("3")


def test_engine_order_fill_updates_status():
    o = make_order(OrderSide.BUY, "100", "1")
    o.fill(Decimal("1"))
    assert o.is_filled
    assert o.status == OrderStatus.FILLED


def test_engine_order_cancel_from_open():
    o = make_order(OrderSide.BUY, "100", "1")
    o.status = OrderStatus.OPEN
    o.cancel()
    assert o.status == OrderStatus.CANCELLED
