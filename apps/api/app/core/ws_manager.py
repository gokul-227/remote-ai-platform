"""
WebSocket Connection Manager for Real-Time Notification Delivery.
Maintains per-user connection registry, broadcasts notifications on write.
Falls back gracefully when no connections are active.
"""

import asyncio
import uuid
from collections import defaultdict
from typing import Dict, List
from fastapi import WebSocket
import structlog

logger = structlog.get_logger("notifications.ws_manager")


class ConnectionManager:
    """Thread-safe WebSocket connection manager per user ID."""

    def __init__(self):
        self._connections: Dict[str, List[WebSocket]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: uuid.UUID) -> None:
        await websocket.accept()
        key = str(user_id)
        async with self._lock:
            self._connections[key].append(websocket)
        logger.info("WebSocket connected", user_id=key, total=len(self._connections[key]))

    async def disconnect(self, websocket: WebSocket, user_id: uuid.UUID) -> None:
        key = str(user_id)
        async with self._lock:
            conns = self._connections.get(key, [])
            if websocket in conns:
                conns.remove(websocket)
            if not conns:
                self._connections.pop(key, None)
        logger.info("WebSocket disconnected", user_id=key)

    async def send_to_user(self, user_id: uuid.UUID, data: dict) -> int:
        """
        Push a JSON message to all active connections for a user.
        Returns the count of successfully delivered messages.
        Dead connections are pruned automatically.
        """
        key = str(user_id)
        delivered = 0
        stale: List[WebSocket] = []

        for ws in list(self._connections.get(key, [])):
            try:
                await ws.send_json(data)
                delivered += 1
            except Exception:
                stale.append(ws)

        if stale:
            async with self._lock:
                for ws in stale:
                    conns = self._connections.get(key, [])
                    if ws in conns:
                        conns.remove(ws)
                if not self._connections.get(key):
                    self._connections.pop(key, None)

        return delivered

    def active_user_count(self) -> int:
        return len(self._connections)

    def connection_count(self) -> int:
        return sum(len(v) for v in self._connections.values())


# Application-wide singleton manager
ws_manager = ConnectionManager()
