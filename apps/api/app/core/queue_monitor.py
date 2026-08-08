"""Best-effort Celery broker queue inspection."""

from typing import Dict

from redis.asyncio import Redis

from app.core.config import settings
from app.core.metrics import CELERY_QUEUE_DEPTH

QUEUE_NAMES = ("default", "jobs", "ai", "matching")


async def get_queue_depths() -> Dict[str, int]:
    client: Redis = Redis.from_url(settings.CELERY_BROKER_URL, socket_connect_timeout=1, socket_timeout=1)
    try:
        depths: Dict[str, int] = {}
        for queue in QUEUE_NAMES:
            depth = int(await client.llen(queue))
            depths[queue] = depth
            CELERY_QUEUE_DEPTH.labels(queue=queue).set(depth)
        return depths
    finally:
        await client.aclose()
