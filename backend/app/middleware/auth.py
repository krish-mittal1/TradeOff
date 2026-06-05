"""JWT Authentication middleware.

Validates Bearer tokens on protected routes and injects user_id into request state.
"""
from fastapi import Request, HTTPException
import uuid
from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.db.session import async_session_factory
from app.models.user import ApiKey
from app.utils.security import verify_api_key, verify_token

# Public endpoints that don't require authentication
PUBLIC_PATHS = {
    "/health",
    "/ready",
    "/metrics",
    "/api/docs",
    "/api/redoc",
    "/api/openapi.json",
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
    "/api/v1/market/pairs",
    "/api/v1/market/tickers",
    "/api/v1/market/ticker/",
    "/api/v1/market/candles",
    "/api/v1/market/trades/",
}


def _inject_user_id_header(request: Request, user_id: uuid.UUID) -> None:
    """Safely inject X-User-ID into the mutable request headers."""
    headers = MutableHeaders(scope=request.scope)
    headers["x-user-id"] = str(user_id)


class AuthMiddleware(BaseHTTPMiddleware):
    """Validates JWT tokens on protected routes."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path.startswith("/ws"):
            return await call_next(request)

        # Skip auth for public endpoints
        if any(path.startswith(p) for p in PUBLIC_PATHS) or path.startswith("/api/v1/market/depth/"):
            return await call_next(request)

        api_key = request.headers.get("X-API-KEY")
        api_secret = request.headers.get("X-API-SECRET")
        if api_key and api_secret:
            async with async_session_factory() as db:
                from sqlalchemy import select

                result = await db.execute(
                    select(ApiKey).where(ApiKey.key_prefix == api_key[-8:], ApiKey.is_active.is_(True))
                )
                candidate = result.scalar_one_or_none()
                if candidate and verify_api_key(api_key, api_secret, candidate.key_hash):
                    request.state.user_id = candidate.user_id
                    request.state.user_role = "user"
                    request.state.api_permissions = candidate.permissions
                    _inject_user_id_header(request, candidate.user_id)
                    return await call_next(request)

            return JSONResponse(
                status_code=401,
                content={"error": "INVALID_API_KEY", "message": "Invalid API key credentials"},
            )

        # Check for Authorization header
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"error": "UNAUTHORIZED", "message": "Missing or invalid Authorization header"},
            )

        token = auth_header[7:]  # Remove "Bearer "
        payload = verify_token(token, expected_type="access")
        if not payload:
            return JSONResponse(
                status_code=401,
                content={"error": "TOKEN_EXPIRED", "message": "Access token expired or invalid"},
            )

        # Extract user_id from token and inject into request state
        try:
            user_id = uuid.UUID(payload["sub"])
            request.state.user_id = user_id
            request.state.user_role = payload.get("role", "user")
        except (ValueError, KeyError):
            return JSONResponse(
                status_code=401,
                content={"error": "INVALID_TOKEN", "message": "Invalid token payload"},
            )

        # Add header for downstream services (audit middleware, etc.)
        _inject_user_id_header(request, user_id)

        return await call_next(request)


async def get_current_user_id(request: Request) -> uuid.UUID:
    """FastAPI dependency to get the authenticated user's ID."""
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id


async def get_current_user_role(request: Request) -> str:
    """FastAPI dependency to get the authenticated user's role."""
    role = getattr(request.state, "user_role", "user")
    return role
