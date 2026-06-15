"""Operational models: outbox, reconciliation, and mock blockchain events."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class OutboxEvent(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "outbox_events"

    aggregate_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    aggregate_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    topic: Mapped[str] = mapped_column(String(100), nullable=False)
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    payload = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReconciliationRun(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "reconciliation_runs"

    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)
    scope: Mapped[str] = mapped_column(String(50), default="LEDGER", nullable=False)
    checked_wallets: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mismatches: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    details = mapped_column(JSONB, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MockChainTransaction(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "mock_chain_transactions"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # DEPOSIT, WITHDRAWAL
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    tx_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    amount: Mapped[str] = mapped_column(String(80), nullable=False)
    confirmations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    required_confirmations: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)
    reference_type: Mapped[str | None] = mapped_column(String(50))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
