"""Best-effort Celery broker queue inspection."""

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.metrics import CELERY_QUEUE_DEPTH

QUEUE_NAMES = ("default", "jobs", "ai", "matching")


async def get_queue_depths() -> dict[str, int]:
    client: Redis = Redis.from_url(
        settings.CELERY_BROKER_URL,
        socket_connect_timeout=1.5,
        socket_timeout=1.5,
    )
    try:
        depths: dict[str, int] = {}
        for queue in QUEUE_NAMES:
            try:
                res = client.llen(queue)
                depth = int(await res) if hasattr(res, "__await__") else int(res)
            except (RedisError, Exception):
                depth = 0
            depths[queue] = depth
            CELERY_QUEUE_DEPTH.labels(queue=queue).set(depth)
        return depths
    except (RedisError, Exception):
        return {queue: 0 for queue in QUEUE_NAMES}
    finally:
        await client.aclose()
