"""Order types, enums, and models for the matching engine."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum


class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP_MARKET = "STOP_MARKET"
    STOP_LIMIT = "STOP_LIMIT"


class TimeInForce(str, Enum):
    GTC = "GTC"  # Good Till Cancelled
    IOC = "IOC"  # Immediate Or Cancel
    FOK = "FOK"  # Fill Or Kill
    GTD = "GTD"  # Good Till Date


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    OPEN = "OPEN"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    TRIGGERED = "TRIGGERED"


@dataclass
class EngineOrder:
    """In-memory representation of an order in the matching engine."""
    order_id: uuid.UUID
    user_id: uuid.UUID
    trading_pair: str
    side: OrderSide
    order_type: OrderType
    price: Decimal | None = None  # None for market orders
    quantity: Decimal = Decimal("0")
    filled_quantity: Decimal = Decimal("0")
    quote_quantity: Decimal | None = None  # For market orders in quote terms
    stop_price: Decimal | None = None
    time_in_force: TimeInForce = TimeInForce.GTC
    iceberg_peak: Decimal | None = None
    iceberg_base: Decimal | None = Decimal("0")
    status: OrderStatus = OrderStatus.PENDING
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime | None = None

    @property
    def remaining_quantity(self) -> Decimal:
        return self.quantity - self.filled_quantity

    @property
    def is_filled(self) -> bool:
        return self.remaining_quantity <= Decimal("0")

    @property
    def is_expired(self) -> bool:
        return bool(self.expires_at and datetime.now(timezone.utc) >= self.expires_at)

    @property
    def is_iceberg(self) -> bool:
        return self.iceberg_peak is not None and self.iceberg_peak > Decimal("0")

    def fill(self, quantity: Decimal) -> Decimal:
        """Fill the order by the given quantity. Returns actual fill amount."""
        actual_fill = min(quantity, self.remaining_quantity)
        self.filled_quantity += actual_fill
        if self.is_filled:
            self.status = OrderStatus.FILLED
        elif self.filled_quantity > Decimal("0"):
            self.status = OrderStatus.PARTIALLY_FILLED
        return actual_fill

    def cancel(self) -> None:
        """Cancel the order."""
        if self.status in (OrderStatus.OPEN, OrderStatus.PENDING, OrderStatus.PARTIALLY_FILLED):
            self.status = OrderStatus.CANCELLED

    def reveal_iceberg_peak(self) -> Decimal | None:
        """Reveal the next iceberg peak. Returns visible quantity or None."""
        if not self.is_iceberg:
            return None
        hidden = self.quantity - self.filled_quantity
        if hidden <= Decimal("0"):
            return None
        visible = min(self.iceberg_peak, hidden)
        self.iceberg_base = hidden - visible
        return visible
