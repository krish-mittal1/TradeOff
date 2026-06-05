"""Trade model for executed trades between maker and taker."""
from decimal import Decimal
import uuid
from datetime import datetime
from sqlalchemy import Integer, String, ForeignKey, Numeric, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, UUIDMixin


class Trade(UUIDMixin, Base):
    __tablename__ = "trades"

    trading_pair_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trading_pairs.id"), nullable=False, index=True)
    taker_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True)
    maker_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True)
    taker_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    maker_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    quote_quantity: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    taker_fee: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    maker_fee: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    taker_side: Mapped[str] = mapped_column(String(4), nullable=False)
    trade_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
