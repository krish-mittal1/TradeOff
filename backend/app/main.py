"""TradeOff - FastAPI application factory."""
import asyncio
import logging
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import Response

from app.config import settings
from app.api.v1.api import api_router
from app.middleware.request_id import RequestIDMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.audit import AuditMiddleware
from app.db.session import engine, async_session_factory
from app.models import Base
from app.observability import MetricsMiddleware, WS_CONNECTIONS
from app.realtime.manager import manager
from app.services.market_data_service import market_data_service
from app.utils.security import verify_token

logger = logging.getLogger(__name__)


async def periodic_expire_orders():
    """Background task to query and expire GTD orders periodically."""
    from app.tasks.jobs import _expire_orders
    import logging
    task_logger = logging.getLogger("app.main.periodic_expire_orders")
    
    while True:
        try:
            await asyncio.sleep(60)
            res = await _expire_orders()
            if res.get("expired_count", 0) > 0:
                task_logger.info(f"Expired {res['expired_count']} orders in periodic background task")
        except asyncio.CancelledError:
            break
        except Exception as e:
            task_logger.exception(f"Error in periodic_expire_orders task: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    logger.info(f"Starting {settings.APP_NAME} in {settings.ENVIRONMENT} mode")

    # Create tables on startup (dev only - use Alembic in production)
    if settings.ENVIRONMENT == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created")

    async with async_session_factory() as db:
        from app.api.v1.demo import ensure_assets_and_pairs

        await ensure_assets_and_pairs(db)
        await db.commit()
        logger.info("Demo market catalog ready")

    # Initialize Kafka producer
    from app.events.kafka_producer import get_kafka_producer
    try:
        producer = await get_kafka_producer()
        await asyncio.wait_for(producer.start(), timeout=5)
        logger.info("Kafka producer started")
    except Exception as e:
        logger.warning(f"Failed to start Kafka producer: {e}")

    # Initialize Redis
    from app.cache.redis_client import get_redis
    try:
        redis = await get_redis()
        await redis.ping()
        logger.info("Redis connected")
    except Exception as e:
        logger.warning(f"Failed to connect to Redis: {e}")

    await market_data_service.start()
    logger.info("Market data service started")

    # Start periodic order expiration
    expire_task = asyncio.create_task(periodic_expire_orders())
    logger.info("Periodic order expiration task started")

    yield

    # Shutdown
    logger.info("Shutting down...")
    expire_task.cancel()
    try:
        await expire_task
    except asyncio.CancelledError:
        pass

    await market_data_service.stop()
    try:
        producer = await get_kafka_producer()
        await producer.stop()
    except Exception:
        pass
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    description="TradeOff production-style centralized exchange simulator API",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# Middleware (order matters - outermost first)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIDMiddleware)
from app.middleware.auth import AuthMiddleware
app.add_middleware(AuthMiddleware)
app.add_middleware(AuditMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(MetricsMiddleware)

# Routers
app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": settings.APP_NAME, "environment": settings.ENVIRONMENT}


@app.get("/ready")
async def readiness_check():
    database = redis_status = False
    try:
        from sqlalchemy import text
        async with async_session_factory() as db:
            await db.execute(text("SELECT 1"))
            database = True
    except Exception:
        pass
    try:
        from app.cache.redis_client import get_redis
        redis_status = await (await get_redis()).ping()
    except Exception:
        pass
    status = "ready" if database else "degraded"
    return {"status": status, "database": database, "redis": redis_status}


@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.websocket("/ws")
async def websocket_gateway(websocket: WebSocket, token: str | None = None):
    payload = verify_token(token, expected_type="access") if token else None
    await manager.connect(websocket)
    WS_CONNECTIONS.inc()
    try:
        await websocket.send_json({"type": "connected", "authenticated": bool(payload)})
        while True:
            message = await websocket.receive_json()
            channel = str(message.get("channel", ""))
            if not channel:
                continue
            if message.get("type") == "subscribe":
                if channel.startswith(("orders.", "wallet.", "notifications.")) and not payload:
                    await websocket.send_json({"type": "error", "message": "Authentication required"})
                    continue
                await manager.subscribe(websocket, channel)
                await websocket.send_json({"type": "subscribed", "channel": channel})
            elif message.get("type") == "unsubscribe":
                await manager.unsubscribe(websocket, channel)
    except WebSocketDisconnect:
        pass
    finally:
        WS_CONNECTIONS.dec()
        await manager.disconnect(websocket)
