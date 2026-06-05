"""V1 API router - aggregates all endpoint modules."""
from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.wallets import router as wallets_router
from app.api.v1.trading import router as trading_router
from app.api.v1.market import router as market_router
from app.api.v1.admin import router as admin_router
from app.api.v1.portfolio import router as portfolio_router
from app.api.v1.trades import router as trades_router
from app.api.v1.ai_assistant import router as ai_router
from app.api.v1.users import router as users_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.risk import router as risk_router
from app.api.v1.copy_trading import router as copy_trading_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.operations import router as operations_router
from app.api.v1.demo import router as demo_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
api_router.include_router(wallets_router, prefix="/wallets", tags=["Wallets"])
api_router.include_router(trading_router, prefix="/orders", tags=["Trading"])
api_router.include_router(trades_router, prefix="/trades", tags=["Trading"])
api_router.include_router(market_router, prefix="/market", tags=["Market Data"])
api_router.include_router(portfolio_router, prefix="/portfolio", tags=["Portfolio"])
api_router.include_router(admin_router, prefix="/admin", tags=["Admin"])
api_router.include_router(ai_router, prefix="/ai", tags=["AI Assistant"])
api_router.include_router(users_router, prefix="/users", tags=["Users"])
api_router.include_router(notifications_router, prefix="/notifications", tags=["Notifications"])
api_router.include_router(risk_router, prefix="/risk", tags=["Risk"])
api_router.include_router(copy_trading_router, prefix="/copy-trading", tags=["Copy Trading"])
api_router.include_router(analytics_router, prefix="/analytics", tags=["Analytics"])
api_router.include_router(operations_router, prefix="/operations", tags=["Operations"])
api_router.include_router(demo_router, prefix="/demo", tags=["Demo"])
