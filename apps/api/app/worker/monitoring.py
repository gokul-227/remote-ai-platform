"""Process-owned liveness, independent of task queues and child task runtimes."""

import asyncio
import atexit
import threading

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.logging import get_logger
from app.domains.tasks.service import TaskService
from app.worker.runtime import worker_id

logger = get_logger(__name__)
_stop = threading.Event()
_thread: threading.Thread | None = None


async def write_heartbeat(identity: str, kind: str, queues: list[str]) -> None:
    # This engine and event loop belong only to the monitor thread. Never use
    # runtime's task loop/engine from the timer thread or inherit it into children.
    engine = create_async_engine(
        settings.DATABASE_URL,
        poolclass=NullPool,
        connect_args={"statement_cache_size": 0, "command_timeout": 10, "timeout": 10}
        if "asyncpg" in settings.DATABASE_URL
        else {},
    )
    try:
        async with AsyncSession(engine) as db:
            active = 0
            if kind == "worker":
                from celery.worker.state import active_requests

                active = len(active_requests)
            await TaskService(db).heartbeat(identity, kind, queues, active_runs=active)
    finally:
        await engine.dispose()


def monitor(identity: str, kind: str, queues: list[str], stop: threading.Event) -> None:
    while not stop.is_set():
        try:
            asyncio.run(write_heartbeat(identity, kind, queues))
        except Exception:
            # Leave last_seen untouched on failure: health must become stale.
            logger.exception("Process heartbeat failed", kind=kind)
        if stop.wait(30):
            return


def start_monitor(kind: str, queues: list[str] | None = None) -> None:
    global _thread, _stop
    if _thread is not None and _thread.is_alive():
        return
    _stop = threading.Event()
    _thread = threading.Thread(
        target=monitor,
        args=(f"{kind}:{worker_id()}", kind, queues or [], _stop),
        name=f"{kind}-heartbeat",
        daemon=True,
    )
    _thread.start()


def stop_monitor() -> None:
    _stop.set()
    if _thread is not None:
        _thread.join(timeout=15)


atexit.register(stop_monitor)
