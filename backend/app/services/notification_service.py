"""Notification creation and realtime fanout."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.realtime.manager import manager


async def create_notification(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    notification_type: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        body=body,
        data=data or {},
    )
    db.add(notification)
    await db.flush()
    await manager.publish(
        f"notifications.{user_id}",
        {
            "type": "notification",
            "id": str(notification.id),
            "title": title,
            "body": body,
            "data": data or {},
        },
    )
    return notification
