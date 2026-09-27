"""
SQLAlchemy 2.x Async Database Engine & Session Factory
"""

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

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


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that provides a database session per request."""
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# Alias for backward compatibility
AsyncSessionLocal = AsyncSessionFactory
