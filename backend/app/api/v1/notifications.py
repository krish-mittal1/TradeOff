"""Notification inbox APIs."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import current_user_id
from app.db.session import get_db
from app.models.notification import Notification

router = APIRouter()


@router.get("")
async def list_notifications(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=100),
):
    query = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        query = query.where(Notification.is_read.is_(False))
    notifications = (await db.execute(query.order_by(Notification.created_at.desc()).limit(limit))).scalars().all()
    return {"notifications": [
        {"id": str(n.id), "type": n.type, "title": n.title, "body": n.body, "data": n.data,
         "is_read": n.is_read, "created_at": n.created_at.isoformat()} for n in notifications
    ]}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: uuid.UUID,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    notification = (await db.execute(select(Notification).where(
        Notification.id == notification_id, Notification.user_id == user_id
    ))).scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    return {"id": str(notification.id), "is_read": True}
