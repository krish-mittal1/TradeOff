"""Asset and TradingPair models."""
import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Asset(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "assets"

    symbol: Mapped[str] = mapped_column(String(10), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    decimals: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    is_fiat: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    min_withdrawal: Mapped[Decimal] = mapped_column(Numeric(40, 8), default=0)
    max_withdrawal: Mapped[Decimal] = mapped_column(Numeric(40, 8), default=0)
    withdrawal_fee: Mapped[Decimal] = mapped_column(Numeric(40, 8), default=0)
    min_deposit: Mapped[Decimal] = mapped_column(Numeric(40, 8), default=0)
    deposit_confirmations: Mapped[int] = mapped_column(Integer, default=1)

    trading_pairs_base = relationship("TradingPair", foreign_keys="TradingPair.base_asset_id", back_populates="base_asset")
    trading_pairs_quote = relationship("TradingPair", foreign_keys="TradingPair.quote_asset_id", back_populates="quote_asset")


class TradingPair(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "trading_pairs"

    symbol: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    base_asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False)
    quote_asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False)
    base_precision: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    quote_precision: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    min_qty: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    max_qty: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    min_notional: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    tick_size: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    step_size: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    maker_fee: Mapped[Decimal] = mapped_column(Numeric(8, 6), default=0.001)
    taker_fee: Mapped[Decimal] = mapped_column(Numeric(8, 6), default=0.001)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    base_asset = relationship("Asset", foreign_keys=[base_asset_id], back_populates="trading_pairs_base")
    quote_asset = relationship("Asset", foreign_keys=[quote_asset_id], back_populates="trading_pairs_quote")
