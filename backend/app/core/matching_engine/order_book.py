"""Price-Time Priority Order Book.

Maintains bid and ask sides as sorted dictionaries for O(log N) operations.
Each price level has a FIFO queue for time priority.
"""
from decimal import Decimal
import uuid
from collections import deque, defaultdict
from dataclasses import dataclass, field
from typing import Optional
from app.core.matching_engine.orders import EngineOrder, OrderSide


@dataclass
class PriceLevel:
    """A single price level containing all orders at this price."""
    price: Decimal
    total_quantity: Decimal = Decimal("0")
    orders: deque = field(default_factory=deque)  # FIFO queue of EngineOrder

    def add_order(self, order: EngineOrder) -> None:
        self.orders.append(order)
        self.total_quantity += order.remaining_quantity

    def remove_order(self, order: EngineOrder) -> None:
        """Remove a specific order (by reference) from this level."""
        # We use a new deque without the order (O(n) but orders per level is small)
        new_orders = deque(o for o in self.orders if o.order_id != order.order_id)
        removed_qty = sum(
            o.remaining_quantity for o in self.orders if o.order_id == order.order_id
        )
        self.total_quantity -= removed_qty
        self.orders = new_orders

    def pop_best(self) -> Optional[EngineOrder]:
        """Pop the oldest (best-priority) order from this level."""
        if not self.orders:
            return None
        order = self.orders.popleft()
        self.total_quantity -= order.remaining_quantity
        return order

    def peek_best(self) -> Optional[EngineOrder]:
        """View the best-priority order without removing it."""
        return self.orders[0] if self.orders else None

    @property
    def order_count(self) -> int:
        return len(self.orders)


class OrderBook:
    """Binance-style order book with price-time priority.

    Bids are sorted descending (highest price first).
    Asks are sorted ascending (lowest price first).
    """

    def __init__(self, pair: str):
        self.pair = pair
        # Price → PriceLevel mapping
        self.bids: dict[Decimal, PriceLevel] = {}  # Buy side
        self.asks: dict[Decimal, PriceLevel] = {}  # Sell side
        # Sorted price lists for O(log N) access
        self.bid_prices: list[Decimal] = []  # Descending
        self.ask_prices: list[Decimal] = []  # Ascending
        # Stop order tracking: stop_price → list of orders
        self.stop_buy: dict[Decimal, list[EngineOrder]] = defaultdict(list)  # Stop price → BUY orders
        self.stop_sell: dict[Decimal, list[EngineOrder]] = defaultdict(list)  # Stop price → SELL orders
        self.orders_by_id: dict[uuid.UUID, EngineOrder] = {}
        # Sequence counter
        self.sequence: int = 0
        self.last_trade_price: Optional[Decimal] = None

    # --- Bid/Ask Management ---

    def _insert_sorted(self, prices: list[Decimal], price: Decimal, reverse: bool = False) -> None:
        """Insert price into sorted list maintaining order."""
        lo, hi = 0, len(prices)
        while lo < hi:
            mid = (lo + hi) // 2
            if reverse:
                if prices[mid] > price:
                    lo = mid + 1
                else:
                    hi = mid
            else:
                if prices[mid] < price:
                    lo = mid + 1
                else:
                    hi = mid
        prices.insert(lo, price)

    def _remove_sorted(self, prices: list[Decimal], price: Decimal) -> None:
        """Remove price from sorted list."""
        try:
            prices.remove(price)
        except ValueError:
            pass

    def add_order(self, order: EngineOrder) -> None:
        """Add an order to the order book."""
        if order.side == OrderSide.BUY:
            self._add_to_side(order, self.bids, self.bid_prices, reverse=True)
        else:
            self._add_to_side(order, self.asks, self.ask_prices, reverse=False)
        self.orders_by_id[order.order_id] = order

    def _add_to_side(
        self,
        order: EngineOrder,
        levels: dict[Decimal, PriceLevel],
        price_list: list[Decimal],
        reverse: bool,
    ) -> None:
        price = order.price
        if price not in levels:
            levels[price] = PriceLevel(price=price)
            self._insert_sorted(price_list, price, reverse=reverse)
        levels[price].add_order(order)

    def remove_order(self, order: EngineOrder) -> None:
        """Remove an order from the order book."""
        if order.side == OrderSide.BUY:
            self._remove_from_side(order, self.bids, self.bid_prices)
        else:
            self._remove_from_side(order, self.asks, self.ask_prices)
        self.orders_by_id.pop(order.order_id, None)

    def _remove_from_side(
        self,
        order: EngineOrder,
        levels: dict[Decimal, PriceLevel],
        price_list: list[Decimal],
    ) -> None:
        price = order.price
        if price not in levels:
            return
        level = levels[price]
        level.remove_order(order)
        if level.order_count == 0:
            del levels[price]
            self._remove_sorted(price_list, price)

    def add_stop_order(self, order: EngineOrder) -> None:
        """Add a stop order to the stop book."""
        if order.side == OrderSide.BUY:
            self.stop_buy[order.stop_price].append(order)
        else:
            self.stop_sell[order.stop_price].append(order)

    # --- Best Bid/Ask ---

    @property
    def best_bid(self) -> Optional[Decimal]:
        """Highest bid price."""
        return self.bid_prices[0] if self.bid_prices else None

    @property
    def best_ask(self) -> Optional[Decimal]:
        """Lowest ask price."""
        return self.ask_prices[0] if self.ask_prices else None

    @property
    def spread(self) -> Optional[Decimal]:
        """Current bid-ask spread."""
        if self.best_bid and self.best_ask:
            return self.best_ask - self.best_bid
        return None

    @property
    def mid_price(self) -> Optional[Decimal]:
        """Midpoint between best bid and ask."""
        if self.best_bid and self.best_ask:
            return (self.best_bid + self.best_ask) / Decimal("2")
        return None

    # --- Depth & Snapshots ---

    def get_depth(self, limit: int = 100) -> dict:
        """Get aggregated order book depth."""
        bids = []
        for price in self.bid_prices[:limit]:
            if price in self.bids:
                level = self.bids[price]
                bids.append([str(price), str(level.total_quantity)])

        asks = []
        for price in self.ask_prices[:limit]:
            if price in self.asks:
                level = self.asks[price]
                asks.append([str(price), str(level.total_quantity)])

        return {
            "lastUpdateId": self.sequence,
            "bids": bids,
            "asks": asks,
        }

    def get_snapshot(self) -> dict:
        """Get a full order book snapshot (for persistence/recovery)."""
        snapshot = self.get_depth(limit=1000)
        snapshot["pair"] = self.pair
        snapshot["last_trade_price"] = str(self.last_trade_price) if self.last_trade_price else None
        snapshot["sequence"] = self.sequence
        return snapshot

    # --- Order Matching ---

    def get_best_order(self, side: OrderSide) -> Optional[EngineOrder]:
        """Get the highest-priority order on the given side without removing."""
        price_list = self.bid_prices if side == OrderSide.BUY else self.ask_prices
        levels = self.bids if side == OrderSide.BUY else self.asks
        if not price_list:
            return None
        best_price = price_list[0]
        level = levels.get(best_price)
        if not level:
            return None
        return level.peek_best()

    def pop_best_order(self, side: OrderSide) -> Optional[EngineOrder]:
        """Pop and return the best-priority order from the given side."""
        price_list = self.bid_prices if side == OrderSide.BUY else self.ask_prices
        levels = self.bids if side == OrderSide.BUY else self.asks
        if not price_list:
            return None
        best_price = price_list[0]
        level = levels.get(best_price)
        if not level or level.order_count == 0:
            if best_price in levels:
                del levels[best_price]
            self._remove_sorted(price_list, best_price)
            return None
        order = level.pop_best()
        if order:
            self.orders_by_id.pop(order.order_id, None)
        if level.order_count == 0:
            del levels[best_price]
            self._remove_sorted(price_list, best_price)
        return order

    def get_order(self, order_id: uuid.UUID) -> Optional[EngineOrder]:
        """Get a resting order by ID in O(1)."""
        return self.orders_by_id.get(order_id)

    def check_stop_orders(self, last_price: Decimal) -> list[EngineOrder]:
        """Check and return triggered stop orders based on last trade price."""
        triggered: list[EngineOrder] = []

        # Check stop_sell (trigger when price <= stop_price)
        triggered_prices = [sp for sp in sorted(self.stop_sell.keys()) if sp >= last_price]
        for sp in triggered_prices:
            triggered.extend(self.stop_sell[sp])
            del self.stop_sell[sp]

        # Check stop_buy (trigger when price >= stop_price)
        triggered_prices = [sp for sp in sorted(self.stop_buy.keys(), reverse=True) if sp <= last_price]
        for sp in triggered_prices:
            triggered.extend(self.stop_buy[sp])
            del self.stop_buy[sp]

        return triggered

    def restore_from_snapshot(self, snapshot: dict) -> None:
        """Restore order book state from a snapshot (used in recovery)."""
        self.sequence = snapshot.get("sequence", 0)
        if snapshot.get("last_trade_price"):
            self.last_trade_price = Decimal(snapshot["last_trade_price"])
        # Note: Full order restoration requires replaying WAL after snapshot
