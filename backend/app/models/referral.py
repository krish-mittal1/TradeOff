"""Referral model."""
from decimal import Decimal
import uuid
from sqlalchemy import String, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin, UUIDMixin


class Referral(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "referrals"

    referrer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    referee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    reward: Mapped[Decimal] = mapped_column(Numeric(40, 8), default=0)
    tier: Mapped[str] = mapped_column(String(20), default="STANDARD")
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")

    __table_args__ = (
        UniqueConstraint("referee_id", name="uq_referee"),
    )
