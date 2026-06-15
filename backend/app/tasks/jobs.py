"""Background jobs. Implemented as idempotent workflows."""
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.db.session import async_session_factory
from app.events.kafka_producer import get_kafka_producer
from app.models.operations import OutboxEvent
from app.services.reconciliation_service import run_reconciliation
from app.tasks.celery_app import celery_app


@celery_app.task(name="app.tasks.jobs.aggregate_candles")
def aggregate_candles() -> dict:
    return asyncio.run(_aggregate_candles())


async def _aggregate_candles() -> dict:
    from datetime import datetime, timedelta, timezone
    from decimal import Decimal

    from sqlalchemy import select

    from app.models.asset import TradingPair
    from app.models.market import Candle
    from app.models.trade import Trade

    async with async_session_factory() as db:
        pairs = (await db.execute(select(TradingPair).where(TradingPair.is_active))).scalars().all()
        now = datetime.now(timezone.utc)
        last_minute_start = now.replace(second=0, microsecond=0) - timedelta(minutes=1)

        aggregated_count = 0
        for pair in pairs:
            latest_candle_query = select(Candle).where(
                Candle.trading_pair_id == pair.id,
                Candle.interval == "1m"
            ).order_by(Candle.time.desc()).limit(1)
            latest_candle = (await db.execute(latest_candle_query)).scalar_one_or_none()

            if latest_candle:
                start_time = latest_candle.time + timedelta(minutes=1)
            else:
                oldest_trade_query = select(Trade.trade_timestamp).where(
                    Trade.trading_pair_id == pair.id
                ).order_by(Trade.trade_timestamp.asc()).limit(1)
                oldest_trade_time = (await db.execute(oldest_trade_query)).scalar()
                if oldest_trade_time:
                    start_time = oldest_trade_time.replace(second=0, microsecond=0)
                else:
                    start_time = last_minute_start

            current_minute = start_time
            while current_minute <= last_minute_start:
                next_minute = current_minute + timedelta(minutes=1)
                trades_query = select(Trade).where(
                    Trade.trading_pair_id == pair.id,
                    Trade.trade_timestamp >= current_minute,
                    Trade.trade_timestamp < next_minute
                ).order_by(Trade.trade_timestamp.asc())
                trades = (await db.execute(trades_query)).scalars().all()

                if trades:
                    open_price = trades[0].price
                    close_price = trades[-1].price
                    high_price = max(t.price for t in trades)
                    low_price = min(t.price for t in trades)
                    volume = sum(t.quantity for t in trades)
                    quote_volume = sum(t.quote_quantity for t in trades)
                    trades_count = len(trades)
                else:
                    prev_close = None
                    prev_candle_query = select(Candle.close).where(
                        Candle.trading_pair_id == pair.id,
                        Candle.interval == "1m",
                        Candle.time == current_minute - timedelta(minutes=1)
                    )
                    prev_close = (await db.execute(prev_candle_query)).scalar()

                    if prev_close is None:
                        prev_trade_query = select(Trade.price).where(
                            Trade.trading_pair_id == pair.id,
                            Trade.trade_timestamp < current_minute
                        ).order_by(Trade.trade_timestamp.desc()).limit(1)
                        prev_close = (await db.execute(prev_trade_query)).scalar()

                    if prev_close is None:
                        from app.services.market_data_service import market_data_service
                        tick = market_data_service.get_tick(pair.symbol)
                        prev_close = tick.price if tick else Decimal("0")

                    open_price = close_price = high_price = low_price = prev_close
                    volume = quote_volume = Decimal("0")
                    trades_count = 0

                existing_candle_query = select(Candle).where(
                    Candle.time == current_minute,
                    Candle.trading_pair_id == pair.id,
                    Candle.interval == "1m"
                )
                existing_candle = (await db.execute(existing_candle_query)).scalar()
                if not existing_candle:
                    new_candle = Candle(
                        time=current_minute,
                        trading_pair_id=pair.id,
                        interval="1m",
                        open=open_price,
                        high=high_price,
                        low=low_price,
                        close=close_price,
                        volume=volume,
                        quote_volume=quote_volume,
                        trades_count=trades_count
                    )
                    db.add(new_candle)
                    aggregated_count += 1

                current_minute = next_minute

            await db.commit()

        return {"status": "success", "candles_aggregated": aggregated_count}


@celery_app.task(name="app.tasks.jobs.expire_orders")
def expire_orders() -> dict:
    return asyncio.run(_expire_orders())


async def _expire_orders() -> dict:
    from datetime import datetime, timezone

    from sqlalchemy import select

    from app.api.v1.trading import get_engine
    from app.models.asset import TradingPair
    from app.models.order import Order
    from app.realtime.manager import manager
    from app.services.wallet_service import release_order_funds

    async with async_session_factory() as db:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(Order, TradingPair)
            .join(TradingPair, Order.trading_pair_id == TradingPair.id)
            .where(
                Order.status.in_(("OPEN", "PENDING", "PARTIALLY_FILLED")),
                Order.expires_at <= now
            )
            .with_for_update()
        )
        expired = result.all()

        count = 0
        for order, pair in expired:
            try:
                engine = get_engine(pair.symbol)
                await engine.cancel_order(order.id)
            except Exception:
                pass

            order.status = "EXPIRED"
            order.version += 1

            await release_order_funds(
                db, user_id=order.user_id, pair=pair, side=order.side,
                remaining_quantity=order.quantity - order.filled_quantity, price=order.price,
                remaining_quote=None, order_id=order.id, fee_rate=pair.taker_fee,
            )

            await manager.publish(f"orders.{order.user_id}", {
                "type": "order", "order_id": str(order.id), "status": "EXPIRED",
                "filled_quantity": str(order.filled_quantity),
            })
            await manager.publish(f"wallet.{order.user_id}", {"type": "wallet.updated"})
            count += 1

        await db.commit()
        return {"status": "ok", "expired_count": count}


@celery_app.task(name="app.tasks.jobs.send_notification")
def send_notification(notification_id: str) -> dict:
    return asyncio.run(_send_notification(notification_id))


async def _send_notification(notification_id: str) -> dict:
    import logging
    import uuid

    from sqlalchemy import select

    from app.models.notification import Notification

    logger = logging.getLogger(__name__)
    async with async_session_factory() as db:
        result = await db.execute(
            select(Notification).where(Notification.id == uuid.UUID(notification_id)).with_for_update()
        )
        notification = result.scalar_one_or_none()
        if not notification:
            return {"status": "error", "message": "Notification not found"}

        logger.info(
            "Sending notification %s to user %s: [%s] %s",
            notification.id,
            notification.user_id,
            notification.title,
            notification.body
        )

        notification.is_push_sent = True
        notification.is_email_sent = True
        await db.commit()

        return {"status": "sent", "notification_id": notification_id}


@celery_app.task(name="app.tasks.jobs.publish_outbox")
def publish_outbox() -> dict:
    return asyncio.run(_publish_outbox())


async def _publish_outbox() -> dict:
    published = 0
    async with async_session_factory() as db:
        events = (
            await db.execute(
                select(OutboxEvent)
                .where(OutboxEvent.status == "PENDING")
                .order_by(OutboxEvent.created_at)
                .limit(100)
                .with_for_update(skip_locked=True)
            )
        ).scalars().all()
        producer = await get_kafka_producer()
        await producer.start()
        for event in events:
            try:
                await producer.produce(event.topic, event.key, event.payload)
                event.status = "PUBLISHED"
                event.published_at = datetime.now(timezone.utc)
                published += 1
            except Exception as exc:
                event.attempts += 1
                event.last_error = str(exc)[:2000]
                if event.attempts >= 10:
                    event.status = "FAILED"
        await db.commit()
    return {"status": "ok", "published": published}


@celery_app.task(name="app.tasks.jobs.reconcile_ledger")
def reconcile_ledger() -> dict:
    return asyncio.run(_reconcile_ledger())


async def _reconcile_ledger() -> dict:
    async with async_session_factory() as db:
        run = await run_reconciliation(db)
        await db.commit()
        return {
            "status": run.status,
            "checked_wallets": run.checked_wallets,
            "mismatches": run.mismatches,
        }
