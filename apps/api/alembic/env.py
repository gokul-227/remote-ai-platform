"""
Alembic migration environment — async SQLAlchemy 2.x.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import settings
from app.core.database import Base

# All domain models must be imported here so Alembic can detect them
import app.domains.auth.models  # noqa: F401
import app.domains.engineers.models  # noqa: F401
import app.domains.companies.models  # noqa: F401
import app.domains.jobs.models  # noqa: F401
import app.domains.matching.models  # noqa: F401
import app.domains.projects.models  # noqa: F401
import app.domains.marketplace.models  # noqa: F401
import app.domains.network.models  # noqa: F401
import app.domains.admin.models  # noqa: F401
import app.domains.applications.models  # noqa: F401
import app.domains.notifications.models  # noqa: F401
import app.domains.saved_jobs.models  # noqa: F401

config = context.config

# Override sqlalchemy.url from settings (respects env vars). "%" is escaped
# as "%%" because Config.set_main_option() goes through configparser, which
# treats a bare "%" as interpolation syntax and raises on a percent-encoded
# URL (e.g. a password containing "%40" for "@") — found live against a
# real deployment, see docs/ACTUAL_SYSTEM_AUDIT.md.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no live DB connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations using an async engine."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        # See app/core/database.py — required for PgBouncer transaction-mode
        # poolers (e.g. Supabase), harmless against a direct connection.
        connect_args={"statement_cache_size": 0},
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
