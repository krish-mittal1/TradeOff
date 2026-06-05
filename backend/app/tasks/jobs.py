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
    return {"status": "scheduled", "job": "aggregate_candles"}


@celery_app.task(name="app.tasks.jobs.expire_orders")
def expire_orders() -> dict:
    return {"status": "scheduled", "job": "expire_orders"}


@celery_app.task(name="app.tasks.jobs.send_notification")
def send_notification(notification_id: str) -> dict:
    return {"status": "queued", "notification_id": notification_id}


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
