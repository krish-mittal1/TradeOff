"""Notification model."""
from decimal import Decimal
import uuid
from sqlalchemy import Boolean, String, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin, UUIDMixin


class Notification(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    data = mapped_column(JSONB, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_push_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    is_email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
