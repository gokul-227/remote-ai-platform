"""
Exactly one Celery Beat.

The scheduler process takes a PostgreSQL session-level advisory lock and keeps
the connection open for its lifetime. A second Beat (a duplicate container, a
leftover process after a deploy) fails to take the lock and exits non-zero, so
the orchestrator restarts it later instead of two schedulers double-enqueueing.
On SQLite (tests) the lock is skipped.
"""

import asyncio
import os
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
            engine = create_async_engine(
                settings.DATABASE_URL,
                poolclass=NullPool,
                isolation_level="AUTOCOMMIT",
                connect_args={"statement_cache_size": 0, "command_timeout": 10, "timeout": 10}
                if "asyncpg" in settings.DATABASE_URL
                else {},
            )
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
                    await asyncio.sleep(10)
                    await verify_lock(conn)

        try:
            asyncio.run(_run())
        except Exception:
            # A dead lock-holder thread must not leave Beat scheduling without
            # exclusivity. Exit the entire process so its supervisor can retry.
            logger.error("Scheduler lock connection lost; stopping scheduler")
            os._exit(4)

    threading.Thread(target=_hold, name="beat-lock", daemon=True).start()
    if not ready.wait(timeout_seconds):
        logger.error("Scheduler lock: database did not answer; exiting")
        sys.exit(2)
    if not result["locked"]:
        logger.error("Another scheduler already holds the Beat lock; exiting")
        sys.exit(3)
    logger.info("Scheduler lock acquired")


async def verify_lock(conn) -> None:
    """Never permit SQLAlchemy to reconnect without the session lock.

    Requires a direct PostgreSQL connection or session-mode pooler. Transaction
    pooling cannot preserve session advisory locks.
    """
    if conn.invalidated:
        raise RuntimeError("Scheduler lock connection invalidated")
    owned = await conn.scalar(
        text(
            "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' "
            "AND pid = pg_backend_pid() AND granted AND classid = :high "
            "AND objid = :low AND objsubid = 1)"
        ),
        {"high": BEAT_LOCK_KEY >> 32, "low": BEAT_LOCK_KEY & 0xFFFFFFFF},
    )
    if not owned:
        raise RuntimeError("Scheduler advisory lock lost")
