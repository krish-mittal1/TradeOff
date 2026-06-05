"""Risk limit model."""
from decimal import Decimal
import uuid
from sqlalchemy import Boolean, Integer, String, ForeignKey, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin, UUIDMixin


class RiskLimit(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "risk_limits"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    max_position_size: Mapped[Decimal | None] = mapped_column(Numeric(40, 8))
    max_open_orders: Mapped[int | None] = mapped_column(Integer)
    daily_withdrawal_limit: Mapped[Decimal | None] = mapped_column(Numeric(40, 8))
    max_leverage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False)
    suspension_reason: Mapped[str | None] = mapped_column(Text)
