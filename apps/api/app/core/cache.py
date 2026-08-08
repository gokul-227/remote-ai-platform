"""Best-effort Redis JSON cache for low-risk read models."""

import json
from typing import Any, Optional

from redis.asyncio import Redis

from app.core.config import settings


class RedisCache:
    def __init__(self, namespace: str = "app"):
        self.namespace = namespace

    def _client(self) -> Redis:
        return Redis.from_url(settings.REDIS_URL, socket_connect_timeout=1, socket_timeout=1)

    def _key(self, key: str) -> str:
        return f"{self.namespace}:{key}"

    async def get_json(self, key: str) -> Optional[Any]:
        client = self._client()
        try:
            value = await client.get(self._key(key))
            return json.loads(value) if value else None
        except Exception:
            return None
        finally:
            await client.aclose()

    async def set_json(self, key: str, value: Any, ttl_seconds: int = 30) -> None:
        client = self._client()
        try:
            await client.set(self._key(key), json.dumps(value, default=str), ex=ttl_seconds)
        except Exception:
            return
        finally:
            await client.aclose()
