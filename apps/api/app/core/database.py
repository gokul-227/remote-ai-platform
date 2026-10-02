"""
SQLAlchemy 2.x Async Database Engine & Session Factory
"""

from collections.abc import AsyncGenerator, Callable
from contextlib import AsyncExitStack
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from starlette.requests import HTTPConnection

from app.core.config import settings


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


# NullPool + statement_cache_size=0. If DATABASE_URL ever points at a
# PgBouncer pooler in transaction/statement mode, asyncpg's deterministic
# per-connection statement naming ("__asyncpg_stmt_1__", not deallocated
# before disconnect) can collide across different pooled clients sharing a
# backend — confirmed live: Supabase's *transaction*-mode pooler (port 6543)
# reproduced DuplicatePreparedStatementError repeatedly and worsened with
# each attempt as more backends accumulated a stale statement, even with
# statement_cache_size=0 set. Supabase's *session*-mode pooler (same host,
# port 5432 — see docs/DEPLOYMENT_ZERO_COST.md) gives each client a dedicated
# backend for the connection's lifetime like a normal Postgres connection,
# which doesn't have this failure mode; that's what production actually uses.
# NullPool + statement_cache_size=0 are kept anyway as cheap defensive
# insurance in case the pooler mode ever changes. Harmless against a direct,
# unpooled Postgres connection (local dev) either way.
def _statement_cache_size() -> int:
    """asyncpg's prepared-statement cache (0 = prepare + execute every query,
    two round trips instead of one). Only a transaction-mode pooler (Supabase
    port 6543) needs it off; persistent session-mode connections can use it.
    DATABASE_STATEMENT_CACHE_SIZE overrides."""
    if settings.DATABASE_STATEMENT_CACHE_SIZE is not None:
        return settings.DATABASE_STATEMENT_CACHE_SIZE
    transaction_pooler = ":6543/" in settings.DATABASE_URL
    return 100 if settings.DATABASE_POOL_ENABLED and not transaction_pooler else 0


# A pool reuses connections: with the API in the US and the database in the
# EU, opening one (TCP + TLS + auth) costs several transatlantic round trips
# on every request. pre_ping replaces connections the pooler has closed.
_pool_args: dict[str, Any] = (
    {
        "pool_size": settings.DATABASE_POOL_SIZE,
        "max_overflow": settings.DATABASE_MAX_OVERFLOW,
        "pool_timeout": settings.DATABASE_POOL_TIMEOUT,
        "pool_recycle": min(settings.DATABASE_POOL_RECYCLE, 300),
        "pool_pre_ping": True,
    }
    if settings.DATABASE_POOL_ENABLED
    else {"poolclass": NullPool}
)
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.is_development,
    **_pool_args,
    connect_args={
        "statement_cache_size": _statement_cache_size(),
        # Client-side limits (not server startup parameters, which a pooler
        # may reject): a hung connect or query can't hold a request forever.
        "timeout": 10,
        "command_timeout": settings.DATABASE_COMMAND_TIMEOUT_SECONDS,
    },
)

# Session factory
AsyncSessionFactory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


def session_dependency(
    factory: async_sessionmaker[AsyncSession],
) -> Callable[[HTTPConnection], AsyncGenerator[AsyncSession, None]]:
    """A request-scoped session that commits BEFORE the response is sent.

    FastAPI runs a yield-dependency's code after `yield` only once the response
    has gone out, so committing there let a client receive 201 and re-read
    before the write was visible (read-your-writes race, seen as a flaky
    "Saved" state), and turned a failed commit into a success the client had
    already been told about. The commit/rollback is therefore registered on
    FastAPI's per-call exit stack, which closes after the endpoint returns and
    its response is serialised but before anything is sent: a failing commit
    becomes a 500, never a false success."""

    async def dependency(conn: HTTPConnection) -> AsyncGenerator[AsyncSession, None]:
        async with factory() as session:

            async def finish(exc_type: type[BaseException] | None, *_: object) -> bool:
                if exc_type is None:
                    await session.commit()
                else:
                    await session.rollback()
                return False  # never swallow the endpoint's exception

            stack = conn.scope.get("fastapi_function_astack")
            if isinstance(stack, AsyncExitStack):
                stack.push_async_exit(finish)
            try:
                yield session
                # Fallback when no per-call stack exists (and a no-op otherwise:
                # nothing is pending after the early commit).
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    return dependency


get_db = session_dependency(AsyncSessionFactory)


# Alias for backward compatibility
AsyncSessionLocal = AsyncSessionFactory
