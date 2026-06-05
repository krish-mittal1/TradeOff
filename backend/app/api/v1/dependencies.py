"""Shared API authentication and authorization dependencies."""
import uuid

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User


async def current_user_id(request: Request) -> uuid.UUID:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id


async def current_user(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    if user.status == "SUSPENDED":
        raise HTTPException(status_code=403, detail="Account is suspended")
    return user


async def require_admin(request: Request) -> None:
    if getattr(request.state, "user_role", "user") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")


def require_api_permission(permission: str):
    async def dependency(request: Request) -> None:
        permissions = getattr(request.state, "api_permissions", None)
        if permissions is not None and not permissions.get(permission, False):
            raise HTTPException(status_code=403, detail=f"API key lacks {permission} permission")

    return dependency
