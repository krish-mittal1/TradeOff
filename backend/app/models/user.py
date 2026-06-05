"""User, Session, and ApiKey models."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin, UUIDMixin


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(100))
    kyc_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING_VERIFICATION", nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    referral_code: Mapped[str | None] = mapped_column(String(20), unique=True)
    referred_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    mfa_secret: Mapped[str | None] = mapped_column(String(64))
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")
    wallets = relationship("UserWallet", back_populates="user", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="user")


class Session(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    refresh_token_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    device_info: Mapped[str | None] = mapped_column(String(500))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user = relationship("User", back_populates="sessions")


class ApiKey(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "api_keys"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    permissions: Mapped[dict] = mapped_column(JSONB, default={"read": True, "trade": False, "withdraw": False})
    ip_whitelist: Mapped[list | None] = mapped_column(JSONB)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    user = relationship("User", back_populates="api_keys")
