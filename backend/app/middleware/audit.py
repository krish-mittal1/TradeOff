"""Audit middleware - logs all sensitive operations.

IMPORTANT: This middleware must NOT consume the request body because that would
break downstream handlers.  We log metadata only (method, path, user-id).
"""
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)


class AuditMiddleware(BaseHTTPMiddleware):
    """Logs write operations on sensitive paths for an audit trail.

    Body consumption is intentionally avoided: reading ``request.body()`` or
    ``request.json()`` inside Starlette middleware consumes the stream and
    prevents the route handler from reading it.  We rely on the
    X-User-ID header injected by ``AuthMiddleware`` for attribution.
    """

    SENSITIVE_PATHS = (
        "/api/v1/auth/",
        "/api/v1/wallets/",
        "/api/v1/orders/",
        "/api/v1/admin/",
    )

    async def dispatch(self, request: Request, call_next):
        if request.method in ("POST", "PUT", "DELETE", "PATCH"):
            if any(request.url.path.startswith(p) for p in self.SENSITIVE_PATHS):
                logger.info(
                    "AUDIT: %s %s user=%s request_id=%s",
                    request.method,
                    request.url.path,
                    request.headers.get("X-User-ID", "anonymous"),
                    getattr(request.state, "request_id", "-"),
                )

        return await call_next(request)
