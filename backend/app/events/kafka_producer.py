"""Kafka event producer for publishing domain events."""
import json
import logging
from typing import Any

from aiokafka import AIOKafkaProducer

from app.config import settings

logger = logging.getLogger(__name__)


class KafkaEventProducer:
    """Singleton Kafka producer for publishing domain events."""

    _instance: "KafkaEventProducer | None" = None
    _producer: AIOKafkaProducer | None = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def start(self):
        if self._producer is None:
            producer = AIOKafkaProducer(
                bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode(),
                key_serializer=lambda k: str(k).encode(),
                acks="all",
                retry_backoff_ms=500,
                enable_idempotence=True,
                compression_type="gzip",
            )
            try:
                await producer.start()
            except Exception:
                try:
                    await producer.stop()
                except Exception:
                    logger.debug("Kafka producer cleanup failed after startup error", exc_info=True)
                self._producer = None
                raise
            self._producer = producer
            logger.info("Kafka producer started")

    async def stop(self):
        if self._producer:
            await self._producer.stop()
            self._producer = None
            logger.info("Kafka producer stopped")

    async def produce(self, topic: str, key: str, value: dict):
        if self._producer is None:
            logger.warning("Kafka producer not started, skipping message")
            return
        try:
            await self._producer.send(topic, key=key, value=value)
        except Exception as e:
            logger.error(f"Failed to produce message to {topic}: {e}")
            raise

    async def produce_order(self, order: Any):
        await self.produce(
            settings.KAFKA_ORDER_TOPIC,
            key=str(order.order_id),
            value={
                "event": "order.created",
                "order_id": str(order.order_id),
                "user_id": str(order.user_id),
                "pair": order.trading_pair,
                "side": order.side.value if hasattr(order.side, "value") else str(order.side),
                "type": order.order_type.value if hasattr(order.order_type, "value") else str(order.order_type),
                "price": str(order.price) if order.price else None,
                "quantity": str(order.quantity),
                "status": order.status.value if hasattr(order.status, "value") else str(order.status),
            },
        )

    async def produce_trade(self, trade: Any, taker_fee: float, maker_fee: float):
        await self.produce(
            settings.KAFKA_TRADE_TOPIC,
            key=str(trade.trade_id),
            value={
                "event": "trade.executed",
                "trade_id": str(trade.trade_id),
                "pair": trade.trading_pair,
                "price": str(trade.price),
                "quantity": str(trade.quantity),
                "quote_qty": str(trade.quote_quantity),
                "taker_order_id": str(trade.taker_order_id),
                "maker_order_id": str(trade.maker_order_id),
                "taker_user_id": str(trade.taker_user_id),
                "maker_user_id": str(trade.maker_user_id),
                "taker_side": trade.taker_side.value if hasattr(trade.taker_side, "value") else str(trade.taker_side),
                "taker_fee": str(taker_fee),
                "maker_fee": str(maker_fee),
                "timestamp": trade.trade_timestamp.isoformat(),
            },
        )

    async def produce_wallet_event(self, event_type: str, user_id: str, data: dict):
        from datetime import datetime, timezone
        await self.produce(
            settings.KAFKA_WALLET_TOPIC,
            key=user_id,
            value={
                "event": event_type,
                "user_id": user_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **data,
            },
        )


_producer_instance: KafkaEventProducer | None = None


async def get_kafka_producer() -> KafkaEventProducer:
    global _producer_instance
    if _producer_instance is None:
        _producer_instance = KafkaEventProducer()
    return _producer_instance
