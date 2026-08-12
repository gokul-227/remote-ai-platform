"""
SQLAlchemy 2.x Async Database Engine & Session Factory
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


# statement_cache_size=0 disables asyncpg's prepared-statement cache. Required
# when DATABASE_URL points at a PgBouncer pooler in transaction/statement mode
# (e.g. Supabase's connection pooler) — such poolers rotate the underlying
# server connection per transaction, so a prepared statement from one
# transaction can collide with another ("DuplicatePreparedStatementError"),
# found live against a real deployment (docs/ACTUAL_SYSTEM_AUDIT.md). Harmless
# against a direct, unpooled Postgres connection (local dev), just skips an
# optimization there.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.is_development,
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    pool_timeout=settings.DATABASE_POOL_TIMEOUT,
    pool_recycle=settings.DATABASE_POOL_RECYCLE,
    pool_pre_ping=True,
    connect_args={"statement_cache_size": 0},
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
