"""
One event loop and one NullPool engine per worker process.

Celery tasks are synchronous; the domain code is async. A single long-lived
loop per process keeps asyncpg connections valid between tasks, and NullPool
means a crashed task never leaks a pooled connection into the next one.
"""

import asyncio
import os
import socket
from collections.abc import Coroutine
from typing import Any, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

T = TypeVar("T")

_loop: asyncio.AbstractEventLoop | None = None
_engine = None
_factory: async_sessionmaker[AsyncSession] | None = None


def worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}"


def loop() -> asyncio.AbstractEventLoop:
    global _loop
    if _loop is None or _loop.is_closed():
        _loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_loop)
    return _loop


def session_factory() -> async_sessionmaker[AsyncSession]:
    """Tests monkeypatch this to point at their database."""
    global _engine, _factory
    if _factory is None:
        _engine = create_async_engine(
            settings.DATABASE_URL,
            poolclass=NullPool,
            connect_args={"statement_cache_size": 0} if "asyncpg" in settings.DATABASE_URL else {},
        )
        _factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
    return _factory


def run(coro: Coroutine[Any, Any, T]) -> T:
    return loop().run_until_complete(coro)


def shutdown() -> None:
    global _engine, _factory, _loop
    if _engine is not None:
        try:
            run(_engine.dispose())
        except Exception:
            pass
    _engine = None
    _factory = None
    if _loop is not None and not _loop.is_closed():
        _loop.close()
    _loop = None
