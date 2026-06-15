"""Market data models for candlestick data."""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Candle(Base):
    __tablename__ = "candles"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    trading_pair_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trading_pairs.id"), primary_key=True)
    interval: Mapped[str] = mapped_column(String(5), primary_key=True)  # 1m, 5m, 15m, 1h, 4h, 1d, 1w
    open: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    high: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    low: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    close: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    volume: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    quote_volume: Mapped[Decimal] = mapped_column(Numeric(40, 8), nullable=False)
    trades_count: Mapped[int] = mapped_column(Integer, nullable=False)
