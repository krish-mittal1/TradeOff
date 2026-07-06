"""TradeOff - FastAPI application factory."""
import bcrypt

# Workaround for passlib + bcrypt >= 4.0.0 compatibility
if not hasattr(bcrypt, "__about__"):
    bcrypt.__about__ = type("About", (object,), {"__version__": bcrypt.__version__})

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import Response

from app.api.v1.api import api_router
from app.config import settings
from app.db.session import async_session_factory, engine
from app.middleware.audit import AuditMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_id import RequestIDMiddleware
from app.models import Base
from app.observability import WS_CONNECTIONS, MetricsMiddleware
from app.realtime.manager import manager
from app.services.market_data_service import market_data_service
from app.utils.security import verify_token

logger = logging.getLogger(__name__)


async def periodic_expire_orders():
    """Background task to query and expire GTD orders periodically."""
    import logging

    from app.tasks.jobs import _expire_orders
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


async def periodic_market_maker():
    """Background task that keeps the order book liquid.

    This is intentionally *non-destructive*: it never cancels existing orders,
    resets the liquidity desk's balance, or rebuilds the in-memory engines. Doing
    any of those while a user trade is settling against a resting order would wipe
    the reservation backing that order and corrupt settlement. Instead it simply
    tops up any ladder level that has been consumed (``ensure_liquidity_order`` is
    idempotent and only re-adds missing levels), so the book self-heals and
    re-centres naturally as price moves through it.
    """
    import logging

    from app.api.v1.demo import (
        LIQUIDITY_BALANCES,
        PAIR_SPECS,
        build_liquidity_ladder,
        ensure_assets_and_pairs,
        ensure_liquidity_order,
        ensure_liquidity_user,
        topup_liquidity_balance,
    )
    from app.api.v1.trading import get_engine
    from app.services.market_data_service import market_data_service

    task_logger = logging.getLogger("app.main.periodic_market_maker")
    # Wait for startup dependencies to be fully ready
    await asyncio.sleep(15)

    while True:
        try:
            async with async_session_factory() as db:
                assets, pairs = await ensure_assets_and_pairs(db)
                liquidity_user = await ensure_liquidity_user(db)

                # Non-destructive balance top-up (only ever raises available).
                for symbol, amount in LIQUIDITY_BALANCES.items():
                    await topup_liquidity_balance(
                        db,
                        user_id=liquidity_user.id,
                        asset=assets[symbol],
                        target_available=amount,
                    )

                for symbol, _, _, _, _, _, _, _, tick_size, step_size, mid in PAIR_SPECS:
                    pair = pairs[symbol]
                    live_tick = market_data_service.get_tick(symbol)
                    mid = live_tick.price if live_tick else mid

                    for side, price, quantity, client_order_id in build_liquidity_ladder(
                        symbol, pair, mid, tick_size, step_size
                    ):
                        await ensure_liquidity_order(
                            db,
                            liquidity_user=liquidity_user,
                            pair=pair,
                            side=side,
                            price=price,
                            quantity=quantity,
                            client_order_id=client_order_id,
                        )

                    if get_engine(symbol).order_book.last_trade_price is None:
                        get_engine(symbol).order_book.last_trade_price = mid

                await db.commit()
                task_logger.debug("Topped up order book liquidity.")
        except asyncio.CancelledError:
            break
        except Exception as e:
            task_logger.exception(f"Error in periodic_market_maker task: {e}")

        await asyncio.sleep(45)

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

    # Start periodic market maker
    mm_task = asyncio.create_task(periodic_market_maker())
    logger.info("Periodic market maker task started")

    yield

    # Shutdown
    logger.info("Shutting down...")
    expire_task.cancel()
    mm_task.cancel()
    try:
        await asyncio.gather(expire_task, mm_task, return_exceptions=True)
    except Exception:
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
