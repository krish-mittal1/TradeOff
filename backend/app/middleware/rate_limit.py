"""Rate limiting middleware using token bucket algorithm."""
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings


class TokenBucket:
    """Token bucket rate limiter."""
    def __init__(self, capacity: int, fill_rate: float):
        self.capacity = capacity
        self.fill_rate = fill_rate
        self.tokens = capacity
        self.last_refill = time.time()

    def consume(self, tokens: int = 1) -> bool:
        now = time.time()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.fill_rate)
        self.last_refill = now
        if self.tokens >= tokens:
            self.tokens -= tokens
            return True
        return False


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limits requests based on client IP."""

    def __init__(self, app):
        super().__init__(app)
        self.buckets: dict[str, TokenBucket] = {}
        self.auth_buckets: dict[str, TokenBucket] = {}
        self.cleanup_interval = 300  # 5 minutes
        self.last_cleanup = time.time()

    def _get_bucket(self, key: str, is_auth: bool = False) -> TokenBucket:
        buckets = self.auth_buckets if is_auth else self.buckets
        if key not in buckets:
            capacity = settings.RATE_LIMIT_AUTH_REQUESTS if is_auth else settings.RATE_LIMIT_REQUESTS
            window = settings.RATE_LIMIT_AUTH_WINDOW if is_auth else settings.RATE_LIMIT_WINDOW
            buckets[key] = TokenBucket(capacity, capacity / window)
        return buckets[key]

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        is_auth = "/auth/" in request.url.path
        bucket = self._get_bucket(client_ip, is_auth)

        if not bucket.consume():
            return JSONResponse(
                status_code=429,
                content={"error": "TOO_MANY_REQUESTS", "message": "Rate limit exceeded"},
                headers={"Retry-After": "60"},
            )

        # Periodic cleanup
        now = time.time()
        if now - self.last_cleanup > self.cleanup_interval:
            self.buckets.clear()
            self.auth_buckets.clear()
            self.last_cleanup = now

        return await call_next(request)
