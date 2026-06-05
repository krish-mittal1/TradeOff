"""Order model - supports all order types with state machine."""
from decimal import Decimal
import uuid
from datetime import datetime
from sqlalchemy import Boolean, Integer, String, ForeignKey, Numeric, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin, UUIDMixin


class Order(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "orders"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    trading_pair_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trading_pairs.id"), nullable=False, index=True)
    side: Mapped[str] = mapped_column(String(4), nullable=False)  # BUY, SELL
    order_type: Mapped[str] = mapped_column(String(20), nullable=False)  # MARKET, LIMIT, STOP_MARKET, STOP_LIMIT
    time_in_force: Mapped[str] = mapped_column(String(3), default="GTC")  # GTC, IOC, FOK, GTD
    price: Mapped[Decimal | None] = mapped_column(Numeric(40, 8))
    stop_price: Mapped[Decimal | None] = mapped_column(Numeric(40, 8))
    quantity: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    filled_quantity: Mapped[Decimal] = mapped_column(Numeric(40, 8), default=0)
    quote_quantity: Mapped[Decimal | None] = mapped_column(Numeric(40, 8))
    iceberg_peak: Mapped[Decimal | None] = mapped_column(Numeric(40, 8))
    iceberg_base: Mapped[Decimal | None] = mapped_column(Numeric(40, 8))
    status: Mapped[str] = mapped_column(
        String(20), default="PENDING", nullable=False, index=True
    )
    reject_reason: Mapped[str | None] = mapped_column(String(50))
    client_order_id: Mapped[str | None] = mapped_column(String(100))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user = relationship("User", back_populates="orders")
    trading_pair = relationship("TradingPair")

    # Order state machine transitions
    VALID_TRANSITIONS = {
        "PENDING": ["OPEN", "REJECTED", "CANCELLED"],
        "OPEN": ["PARTIALLY_FILLED", "FILLED", "CANCELLED", "EXPIRED", "TRIGGERED"],
        "PARTIALLY_FILLED": ["OPEN", "FILLED", "CANCELLED"],
        "FILLED": [],
        "CANCELLED": [],
        "REJECTED": [],
        "EXPIRED": [],
        "TRIGGERED": ["PENDING"],  # Stop order triggered → new pending order
    }

    def can_transition_to(self, new_status: str) -> bool:
        return new_status in self.VALID_TRANSITIONS.get(self.status, [])

    def transition_to(self, new_status: str) -> None:
        if not self.can_transition_to(new_status):
            raise ValueError(f"Cannot transition from {self.status} to {new_status}")
        self.status = new_status
