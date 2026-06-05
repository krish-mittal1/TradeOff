"""Prometheus metrics for API and exchange health."""
import time

from prometheus_client import Counter, Gauge, Histogram
from starlette.middleware.base import BaseHTTPMiddleware

HTTP_REQUESTS = Counter("cex_http_requests_total", "HTTP requests", ["method", "path", "status"])
HTTP_LATENCY = Histogram("cex_http_request_duration_seconds", "HTTP latency", ["method", "path"])
WS_CONNECTIONS = Gauge("cex_websocket_connections", "Active WebSocket connections")
ORDERS = Counter("cex_orders_total", "Orders processed", ["pair", "side", "type", "status"])
TRADES = Counter("cex_trades_total", "Trades executed", ["pair"])


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        path = request.scope.get("route").path if request.scope.get("route") else request.url.path
        HTTP_REQUESTS.labels(request.method, path, response.status_code).inc()
        HTTP_LATENCY.labels(request.method, path).observe(time.perf_counter() - started)
        return response
