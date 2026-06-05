"""In-process WebSocket subscription manager.

For horizontal scale, instances publish through Redis Pub/Sub and each gateway
fans messages out to its locally connected clients.
"""
import asyncio
from collections import defaultdict
import json
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()
        self.subscriptions: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.connections.discard(websocket)
            for clients in self.subscriptions.values():
                clients.discard(websocket)

    async def subscribe(self, websocket: WebSocket, channel: str) -> None:
        async with self._lock:
            self.subscriptions[channel].add(websocket)

    async def unsubscribe(self, websocket: WebSocket, channel: str) -> None:
        async with self._lock:
            self.subscriptions[channel].discard(websocket)

    async def publish(self, channel: str, payload: dict[str, Any]) -> None:
        message = json.dumps({"channel": channel, **payload}, default=str)
        stale = []
        for websocket in list(self.subscriptions.get(channel, set())):
            try:
                await websocket.send_text(message)
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            await self.disconnect(websocket)


manager = ConnectionManager()
