"""Redis client wrapper with connection pooling."""
import json
from typing import Any, Optional
from redis.asyncio import Redis, from_url
from app.config import settings


class RedisClient:
    """Wrapper around Redis async client with helper methods."""

    _instance: Optional["RedisClient"] = None

    def __init__(self):
        self.client: Optional[Redis] = None

    @classmethod
    async def get_instance(cls) -> "RedisClient":
        if cls._instance is None:
            cls._instance = cls()
            cls._instance.client = await from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
        return cls._instance

    async def get(self, key: str) -> Optional[str]:
        return await self.client.get(key)

    async def set(self, key: str, value: str, expire: int = 3600) -> None:
        await self.client.set(key, value, ex=expire)

    async def set_json(self, key: str, value: Any, expire: int = 3600) -> None:
        await self.client.set(key, json.dumps(value), ex=expire)

    async def get_json(self, key: str) -> Optional[Any]:
        val = await self.client.get(key)
        if val:
            return json.loads(val)
        return None

    async def delete(self, key: str) -> None:
        await self.client.delete(key)

    async def exists(self, key: str) -> bool:
        return await self.client.exists(key) > 0

    async def expire(self, key: str, seconds: int) -> None:
        await self.client.expire(key, seconds)

    async def incr(self, key: str) -> int:
        return await self.client.incr(key)

    async def publish(self, channel: str, message: str) -> None:
        await self.client.publish(channel, message)

    async def subscribe(self, channel: str):
        pubsub = self.client.pubsub()
        await pubsub.subscribe(channel)
        return pubsub

    async def ping(self) -> bool:
        try:
            return await self.client.ping()
        except Exception:
            return False

    async def close(self) -> None:
        if self.client:
            await self.client.close()


async def get_redis() -> RedisClient:
    """FastAPI dependency to get Redis client."""
    return await RedisClient.get_instance()
