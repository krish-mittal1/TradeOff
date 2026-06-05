"""Transactional outbox helpers."""
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operations import OutboxEvent


def add_outbox_event(
    db: AsyncSession,
    *,
    aggregate_type: str,
    aggregate_id: str,
    event_type: str,
    topic: str,
    key: str,
    payload: dict[str, Any],
) -> None:
    db.add(
        OutboxEvent(
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            event_type=event_type,
            topic=topic,
            key=key,
            payload=payload,
        )
    )
