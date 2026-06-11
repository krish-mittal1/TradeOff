from pydantic_settings import BaseSettings
from typing import Optional
import json


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "TradeOff"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "DEBUG"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://cex:cex_dev_password@localhost:5432/cex"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10
    DATABASE_POOL_TIMEOUT: int = 30
    DATABASE_ECHO: bool = False

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_SESSION_DB: int = 0
    REDIS_CACHE_DB: int = 1
    REDIS_RATE_LIMIT_DB: int = 2

    # Kafka
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_ORDER_TOPIC: str = "orders"
    KAFKA_TRADE_TOPIC: str = "trades"
    KAFKA_ORDERBOOK_TOPIC: str = "orderbook.events"
    KAFKA_WALLET_TOPIC: str = "wallet.events"
    KAFKA_SETTLEMENT_TOPIC: str = "wallet.settlements"
    KAFKA_NOTIFICATION_TOPIC: str = "notifications"
    KAFKA_AUDIT_TOPIC: str = "audit.events"
    KAFKA_ANALYTICS_TOPIC: str = "analytics.raw"
    KAFKA_ORDERS_WAL_TOPIC: str = "orders.wal"
    KAFKA_TRADES_WAL_TOPIC: str = "trades.wal"
    KAFKA_MARKET_DATA_TOPIC: str = "market.data"
    KAFKA_DLQ_TOPIC: str = "dead.letter.queue"
    KAFKA_CONSUMER_GROUP: str = "cex-engine"
    KAFKA_NUM_PARTITIONS: int = 12

    # JWT
    JWT_SECRET: str = "dev-jwt-secret-change-in-production-min-32-chars"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Security
    BCRYPT_ROUNDS: int = 12
    CORS_ORIGINS: str = '["http://localhost:3000"]'
    RATE_LIMIT_REQUESTS: int = 10000
    RATE_LIMIT_WINDOW: int = 60
    RATE_LIMIT_AUTH_REQUESTS: int = 10000
    RATE_LIMIT_AUTH_WINDOW: int = 60

    # Elasticsearch
    ELASTICSEARCH_URL: str = "http://localhost:9200"
    ELASTICSEARCH_ENABLED: bool = False

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/3"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/3"

    # Matching Engine
    ME_SNAPSHOT_INTERVAL_SECONDS: int = 10
    ME_WAL_FLUSH_INTERVAL_MS: int = 5
    ME_MAX_ORDERS_PER_SECOND: int = 10000

    # Withdrawals
    WITHDRAWAL_MIN_CONFIRMATIONS: int = 1
    WITHDRAWAL_DAILY_LIMIT_DEFAULT: float = 10000.0
    WITHDRAWAL_ADDRESS_COOLDOWN_HOURS: int = 24

    # Fees
    DEFAULT_MAKER_FEE: float = 0.001
    DEFAULT_TAKER_FEE: float = 0.001

    # AI
    OPENAI_API_KEY: Optional[str] = None
    AI_MODEL: str = "gpt-4"
    AI_MAX_TOKENS: int = 2000

    # Monitoring
    SENTRY_DSN: Optional[str] = None
    PROMETHEUS_ENABLED: bool = True
    OPENTELEMETRY_ENABLED: bool = False

    class Config:
        env_file = ".env"
        case_sensitive = True

    @property
    def cors_origins_list(self) -> list[str]:
        value = self.CORS_ORIGINS.strip()
        if (value.startswith("'") and value.endswith("'")) or (
            value.startswith('"') and value.endswith('"') and value[1:2] == "["
        ):
            value = value[1:-1]
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            parsed = [origin.strip() for origin in value.split(",") if origin.strip()]
        return parsed if isinstance(parsed, list) else [str(parsed)]


settings = Settings()
