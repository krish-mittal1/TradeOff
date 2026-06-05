"""Wallet, LedgerEntry, Deposit, and Withdrawal models."""
from decimal import Decimal
import uuid
from datetime import datetime
from sqlalchemy import BigInteger, Boolean, CheckConstraint, Integer, String, ForeignKey, Numeric, DateTime, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin, UUIDMixin


class UserWallet(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "user_wallets"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False)
    available: Mapped[Decimal] = mapped_column(Numeric(40, 8), default=0, nullable=False)
    locked: Mapped[Decimal] = mapped_column(Numeric(40, 8), default=0, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    user = relationship("User", back_populates="wallets")

    __table_args__ = (
        UniqueConstraint("user_id", "asset_id", name="uq_user_wallet_asset"),
        CheckConstraint("available >= 0", name="ck_wallet_available_nonnegative"),
        CheckConstraint("locked >= 0", name="ck_wallet_locked_nonnegative"),
    )


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    transaction_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False)
    debit: Mapped[Decimal] = mapped_column(Numeric(40, 8), default=0)
    credit: Mapped[Decimal] = mapped_column(Numeric(40, 8), default=0)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    entry_type: Mapped[str] = mapped_column(String(50), nullable=False)
    reference_type: Mapped[str | None] = mapped_column(String(50))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        CheckConstraint("debit >= 0", name="ck_ledger_debit_nonnegative"),
        CheckConstraint("credit >= 0", name="ck_ledger_credit_nonnegative"),
        CheckConstraint("(debit = 0) <> (credit = 0)", name="ck_ledger_single_sided"),
    )


class Deposit(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "deposits"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    tx_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    confirmations: Mapped[int] = mapped_column(Integer, default=0)
    required_confirmations: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Withdrawal(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "withdrawals"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    fee: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    net_amount: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    tx_hash: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)
    requires_2fa: Mapped[bool] = mapped_column(Boolean, default=True)
    requires_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
