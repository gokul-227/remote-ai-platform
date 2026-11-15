"""In-process cache of public job-list pages (PERF-01).

The public list is identical for every visitor, and the API sits an ocean
away from the database, so repeated identical queries are answered from
memory for TTL_SECONDS. Bounded (least recently used entries go first) so
varied queries can't grow memory. Any job change in this process empties
it; other workers catch up within TTL_SECONDS.

Shared tier (JOB_CACHE_REDIS_ENABLED, on in production): entries are also kept
in Redis for SHARED_TTL_SECONDS, so every uvicorn worker (and a restarted one)
answers a page another worker already computed. At 10M jobs a facet or count
query costs seconds of CPU; computing each distinct one once per TTL instead of
once per worker is what keeps search under the p95 budget
(docs/operations/capacity.md). Redis errors fall back to the database.
"""

import hashlib
import json
import time
from collections import OrderedDict
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session

TTL_SECONDS = 60
MAX_ENTRIES = 256

_entries: OrderedDict[Any, tuple[float, Any]] = OrderedDict()


def get(key: Any) -> Any | None:
    entry = _entries.get(key)
    if entry is None:
        return None
    expires, value = entry
    if expires < time.monotonic():
        _entries.pop(key, None)
        return None
    _entries.move_to_end(key)
    return value


def put(key: Any, value: Any) -> None:
    _entries[key] = (time.monotonic() + TTL_SECONDS, value)
    _entries.move_to_end(key)
    while len(_entries) > MAX_ENTRIES:
        _entries.popitem(last=False)


def clear() -> None:
    _entries.clear()


SHARED_TTL_SECONDS = 120
_redis: Any = None


def _shared() -> Any:
    """One pooled Redis client per process (None when the shared tier is off)."""
    global _redis
    from app.core.config import settings

    if not settings.JOB_CACHE_REDIS_ENABLED:
        return None
    if _redis is None:
        from redis.asyncio import Redis

        _redis = Redis.from_url(
            settings.JOB_CACHE_REDIS_URL or settings.redis_url, socket_connect_timeout=0.5, socket_timeout=0.5, max_connections=20
        )
    return _redis


def _shared_key(key: Any) -> str:
    from app.core.config import settings

    digest = hashlib.sha256(str(key).encode()).hexdigest()
    return settings.redis_key(f"jobs:list:v2:{digest}")


async def aget(key: Any) -> Any | None:
    """In-process first, then the shared Redis tier (refilling the local one)."""
    value = get(key)
    if value is not None:
        return value
    client = _shared()
    if client is None:
        return None
    try:
        raw = await client.get(_shared_key(key))
    except Exception:
        return None
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except (ValueError, TypeError):
        return None
    put(key, value)
    return value


async def aput(key: Any, value: Any, shared_ttl: int = SHARED_TTL_SECONDS) -> None:
    put(key, value)
    client = _shared()
    if client is None:
        return
    try:
        await client.set(_shared_key(key), json.dumps(value, default=str), ex=shared_ttl)
    except Exception:
        return


def _is_job(obj: object) -> bool:
    return type(obj).__name__ == "JobPost"


@event.listens_for(Session, "after_flush")
def _jobs_changed(session: Session, _ctx: object) -> None:
    if any(_is_job(o) for o in (*session.new, *session.dirty, *session.deleted)):
        clear()


@event.listens_for(Session, "do_orm_execute")
def _bulk_job_change(state: ORMExecuteState) -> None:
    # Bulk UPDATE/DELETE statements (e.g. expiring unseen jobs) skip flush events.
    if (state.is_update or state.is_delete) and any(
        m.class_.__name__ == "JobPost" for m in state.all_mappers
    ):
        clear()
