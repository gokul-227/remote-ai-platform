"""
Exactly one Celery Beat.

The scheduler process takes a PostgreSQL session-level advisory lock and keeps
the connection open for its lifetime. A second Beat (a duplicate container, a
leftover process after a deploy) fails to take the lock and exits non-zero, so
the orchestrator restarts it later instead of two schedulers double-enqueueing.
On SQLite (tests) the lock is skipped.
"""

import asyncio
import sys
import threading

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

BEAT_LOCK_KEY = 7_412_908_321  # arbitrary, stable


def acquire_or_exit(timeout_seconds: float = 15.0) -> None:
    if not settings.DATABASE_URL.startswith("postgresql"):
        return
    ready = threading.Event()
    result: dict[str, bool] = {"locked": False}

    def _hold() -> None:
        async def _run() -> None:
            engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
            async with engine.connect() as conn:
                row = await conn.execute(
                    text("SELECT pg_try_advisory_lock(:k)"), {"k": BEAT_LOCK_KEY}
                )
                locked: bool = bool(row.scalar_one())
                result["locked"] = locked
                ready.set()
                if not locked:
                    return
                # Hold the connection (and the lock) until the process ends.
                while True:
                    await asyncio.sleep(60)
                    await conn.execute(text("SELECT 1"))

        asyncio.run(_run())

    threading.Thread(target=_hold, name="beat-lock", daemon=True).start()
    if not ready.wait(timeout_seconds):
        logger.error("Scheduler lock: database did not answer; exiting")
        sys.exit(2)
    if not result["locked"]:
        logger.error("Another scheduler already holds the Beat lock; exiting")
        sys.exit(3)
    logger.info("Scheduler lock acquired")
