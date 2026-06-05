"""Matching Engine - Core trading engine with price-time priority.

Supports market, limit, stop-market, stop-limit, and iceberg orders
with partial fills, full fills, and FIFO ordering.
"""
from decimal import Decimal
import uuid
import asyncio
from datetime import datetime, timezone
from dataclasses import dataclass, field
from typing import Optional

from app.core.matching_engine.orders import (
    EngineOrder, OrderSide, OrderType, OrderStatus, TimeInForce,
)
from app.core.matching_engine.order_book import OrderBook


@dataclass
class Trade:
    """An executed trade between a taker and maker."""
    trade_id: uuid.UUID
    trading_pair: str
    price: Decimal
    quantity: Decimal
    quote_quantity: Decimal
    taker_order_id: uuid.UUID
    maker_order_id: uuid.UUID
    taker_user_id: uuid.UUID
    maker_user_id: uuid.UUID
    taker_side: OrderSide
    taker_fee: Decimal
    maker_fee: Decimal
    trade_timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class MatchResult:
    """Result of processing an order through the matching engine."""
    trades: list[Trade] = field(default_factory=list)
    taker_order: Optional[EngineOrder] = None
    maker_orders_filled: list[EngineOrder] = field(default_factory=list)
    remaining_quantity: Decimal = Decimal("0")
    is_complete: bool = False


class MatchingEngine:
    """The core matching engine.

    Implements price-time priority matching for all order types.
    Each trading pair gets its own engine instance with a dedicated lock.
    """

    def __init__(self, pair: str, maker_fee: Decimal = Decimal("0.001"), taker_fee: Decimal = Decimal("0.001")):
        self.pair = pair
        self.order_book = OrderBook(pair)
        self.maker_fee = maker_fee
        self.taker_fee = taker_fee
        self._lock = asyncio.Lock()
        self._pending_stop_orders: list[EngineOrder] = []

    async def process_order(self, order: EngineOrder) -> MatchResult:
        """Process an order through the matching engine.

        This is the main entry point. All order types are handled here.
        """
        async with self._lock:
            return self._process_order_sync(order)

    def _process_order_sync(self, order: EngineOrder) -> MatchResult:
        """Synchronous order processing (called inside the lock)."""
        self.order_book.sequence += 1
        result = MatchResult(taker_order=order)

        # Check expiry
        if order.is_expired:
            order.status = OrderStatus.EXPIRED
            result.is_complete = True
            return result

        # Route to appropriate handler based on order type
        if order.order_type == OrderType.MARKET:
            return self._process_market_order(order, result)
        elif order.order_type == OrderType.LIMIT:
            return self._process_limit_order(order, result)
        elif order.order_type in (OrderType.STOP_MARKET, OrderType.STOP_LIMIT):
            return self._process_stop_order(order, result)
        else:
            order.status = OrderStatus.REJECTED
            order.reject_reason = "UNSUPPORTED_ORDER_TYPE"
            result.is_complete = True
            return result

    def _process_market_order(self, order: EngineOrder, result: MatchResult) -> MatchResult:
        """Process a market order - matches immediately against the order book."""
        taker_side = order.side
        maker_side = OrderSide.SELL if taker_side == OrderSide.BUY else OrderSide.BUY

        remaining = order.quantity if order.quantity > Decimal("0") else Decimal("0")
        # If quote_quantity is set, we need to track how much quote we've spent
        quote_remaining = order.quote_quantity or Decimal("0")

        # For market orders, we need either quantity or quote_quantity
        if remaining == Decimal("0") and quote_remaining == Decimal("0"):
            order.status = OrderStatus.REJECTED
            order.reject_reason = "NO_QUANTITY"
            result.is_complete = True
            return result

        if order.time_in_force == TimeInForce.FOK and not self._can_fully_fill(order):
            order.status = OrderStatus.CANCELLED
            order.reject_reason = "FOK_NOT_FILLABLE"
            result.is_complete = True
            return result

        while True:
            maker_order = self.order_book.pop_best_order(maker_side)
            if not maker_order:
                break  # No liquidity available

            match_price = maker_order.price if maker_order.price else Decimal("0")

            if remaining > Decimal("0"):
                # Quantity-based market order
                fill_qty = min(remaining, maker_order.remaining_quantity)
            else:
                # Quote-based market order (e.g., buy $1000 worth of BTC)
                # Calculate how much base we can buy with the remaining quote
                if match_price <= Decimal("0"):
                    break
                max_base_from_quote = quote_remaining / match_price
                fill_qty = min(max_base_from_quote, maker_order.remaining_quantity)

            if fill_qty <= Decimal("0"):
                continue

            fill_quote = fill_qty * match_price

            # Execute the trade
            trade = Trade(
                trade_id=uuid.uuid4(),
                trading_pair=self.pair,
                price=match_price,
                quantity=fill_qty,
                quote_quantity=fill_quote,
                taker_order_id=order.order_id,
                maker_order_id=maker_order.order_id,
                taker_user_id=order.user_id,
                maker_user_id=maker_order.user_id,
                taker_side=taker_side,
                taker_fee=self.taker_fee * fill_quote,
                maker_fee=self.maker_fee * fill_quote,
            )
            result.trades.append(trade)

            # Update quantities
            maker_order.fill(fill_qty)
            order.fill(fill_qty)
            remaining -= fill_qty
            quote_remaining -= fill_quote

            if maker_order.is_filled:
                result.maker_orders_filled.append(maker_order)
                # Check for iceberg reveal
                if maker_order.is_iceberg:
                    new_peak = maker_order.reveal_iceberg_peak()
                    if new_peak and new_peak > Decimal("0"):
                        self.order_book.add_order(maker_order)
            else:
                # Partial fill on maker - put back remaining
                self.order_book.add_order(maker_order)

            if remaining <= Decimal("0") and quote_remaining <= Decimal("0"):
                break

        # Update order status
        if order.is_filled:
            order.status = OrderStatus.FILLED
        elif order.filled_quantity > Decimal("0"):
            order.status = OrderStatus.PARTIALLY_FILLED
        else:
            order.status = OrderStatus.CANCELLED
            order.reject_reason = "NO_LIQUIDITY"

        # Update last trade price
        if result.trades:
            self.order_book.last_trade_price = result.trades[-1].price

        # Check stop orders after trade
        self._check_stop_orders()

        result.is_complete = True
        return result

    def _process_limit_order(self, order: EngineOrder, result: MatchResult) -> MatchResult:
        """Process a limit order - matches if price crosses, otherwise rests on book."""
        taker_side = order.side
        maker_side = OrderSide.SELL if taker_side == OrderSide.BUY else OrderSide.BUY

        remaining = order.quantity
        order.status = OrderStatus.OPEN

        if order.time_in_force == TimeInForce.FOK and not self._can_fully_fill(order):
            order.status = OrderStatus.CANCELLED
            order.reject_reason = "FOK_NOT_FILLABLE"
            result.is_complete = True
            return result

        while remaining > Decimal("0"):
            maker_order = self.order_book.get_best_order(maker_side)
            if not maker_order:
                break  # No orders on the other side

            # Check if price crosses (BUY bid >= ask, SELL ask <= bid)
            can_match = False
            if taker_side == OrderSide.BUY and maker_order.price and order.price:
                can_match = order.price >= maker_order.price
            elif taker_side == OrderSide.SELL and maker_order.price and order.price:
                can_match = order.price <= maker_order.price

            if not can_match:
                break  # Price doesn't cross

            maker_order = self.order_book.pop_best_order(maker_side)
            if not maker_order:
                break

            match_price = maker_order.price
            fill_qty = min(remaining, maker_order.remaining_quantity)
            fill_quote = fill_qty * match_price

            trade = Trade(
                trade_id=uuid.uuid4(),
                trading_pair=self.pair,
                price=match_price,
                quantity=fill_qty,
                quote_quantity=fill_quote,
                taker_order_id=order.order_id,
                maker_order_id=maker_order.order_id,
                taker_user_id=order.user_id,
                maker_user_id=maker_order.user_id,
                taker_side=taker_side,
                taker_fee=self.taker_fee * fill_quote,
                maker_fee=self.maker_fee * fill_quote,
            )
            result.trades.append(trade)

            maker_order.fill(fill_qty)
            order.fill(fill_qty)
            remaining -= fill_qty

            if maker_order.is_filled:
                result.maker_orders_filled.append(maker_order)
                if maker_order.is_iceberg:
                    new_peak = maker_order.reveal_iceberg_peak()
                    if new_peak and new_peak > Decimal("0"):
                        self.order_book.add_order(maker_order)
            else:
                self.order_book.add_order(maker_order)

        # Update order status
        if order.is_filled:
            order.status = OrderStatus.FILLED
        elif order.filled_quantity > Decimal("0"):
            order.status = OrderStatus.PARTIALLY_FILLED
        else:
            order.status = OrderStatus.OPEN

        # If still has remaining quantity, add to order book (unless IOC/FOK)
        if remaining > Decimal("0") and order.time_in_force in (TimeInForce.GTC, TimeInForce.GTD):
            # Handle iceberg orders
            if order.is_iceberg:
                visible = order.reveal_iceberg_peak()
                if visible and visible > Decimal("0"):
                    order.quantity = order.filled_quantity + visible
                    self.order_book.add_order(order)
            else:
                order.quantity = order.filled_quantity + remaining
                self.order_book.add_order(order)
        elif remaining > Decimal("0"):
            # IOC/FOK - remaining is cancelled
            if order.filled_quantity == Decimal("0"):
                order.status = OrderStatus.CANCELLED

        if order.status == OrderStatus.OPEN and order.remaining_quantity == Decimal("0"):
            order.status = OrderStatus.FILLED

        # Update last trade price
        if result.trades:
            self.order_book.last_trade_price = result.trades[-1].price

        # Check stop orders
        self._check_stop_orders()

        result.remaining_quantity = remaining
        result.is_complete = True
        return result

    def _can_fully_fill(self, order: EngineOrder) -> bool:
        """Preflight FOK liquidity without mutating the book."""
        maker_side = OrderSide.SELL if order.side == OrderSide.BUY else OrderSide.BUY
        prices = self.order_book.ask_prices if maker_side == OrderSide.SELL else self.order_book.bid_prices
        levels = self.order_book.asks if maker_side == OrderSide.SELL else self.order_book.bids
        remaining = order.quantity
        quote_remaining = order.quote_quantity or Decimal("0")
        for price in prices:
            if order.order_type == OrderType.LIMIT:
                if order.side == OrderSide.BUY and order.price < price:
                    break
                if order.side == OrderSide.SELL and order.price > price:
                    break
            available = levels[price].total_quantity
            if remaining > 0:
                remaining -= min(remaining, available)
                if remaining <= 0:
                    return True
            elif quote_remaining > 0:
                quote_remaining -= min(quote_remaining, available * price)
                if quote_remaining <= 0:
                    return True
        return False

    def _process_stop_order(self, order: EngineOrder, result: MatchResult) -> MatchResult:
        """Process a stop order - adds to stop book, triggers when price crosses."""
        order.status = OrderStatus.PENDING
        self.order_book.add_stop_order(order)
        result.is_complete = True
        return result

    def _check_stop_orders(self) -> list[EngineOrder]:
        """Check and trigger stop orders based on last trade price."""
        if not self.order_book.last_trade_price:
            return []
        triggered = self.order_book.check_stop_orders(self.order_book.last_trade_price)
        self._pending_stop_orders.extend(triggered)
        return triggered

    async def get_pending_stop_orders(self) -> list[EngineOrder]:
        """Get and clear triggered stop orders (to be processed as market/limit orders)."""
        async with self._lock:
            pending = self._pending_stop_orders.copy()
            self._pending_stop_orders.clear()
            return pending

    async def cancel_order(self, order_id: uuid.UUID) -> bool:
        """Cancel an order in the order book."""
        async with self._lock:
            order = self.order_book.get_order(order_id)
            if not order:
                return False
            self.order_book.remove_order(order)
            order.cancel()
            return True

    def get_depth(self, limit: int = 100) -> dict:
        """Get current market depth."""
        return self.order_book.get_depth(limit=limit)

    @property
    def best_bid(self) -> Optional[Decimal]:
        return self.order_book.best_bid

    @property
    def best_ask(self) -> Optional[Decimal]:
        return self.order_book.best_ask

    @property
    def last_price(self) -> Optional[Decimal]:
        return self.order_book.last_trade_price
