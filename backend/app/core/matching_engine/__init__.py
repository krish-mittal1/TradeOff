"""Matching Engine - The core of the exchange.

This module implements a price-time priority matching engine
supporting market, limit, stop, and iceberg orders with FIFO ordering.
"""
from app.core.matching_engine.engine import MatchingEngine
from app.core.matching_engine.order_book import OrderBook, PriceLevel
from app.core.matching_engine.orders import (
    EngineOrder,
    OrderSide,
    OrderStatus,
    OrderType,
    TimeInForce,
)

__all__ = [
    "MatchingEngine",
    "OrderBook",
    "PriceLevel",
    "EngineOrder",
    "OrderStatus",
    "OrderSide",
    "OrderType",
    "TimeInForce",
]
