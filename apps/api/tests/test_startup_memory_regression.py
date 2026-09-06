"""Regression test for a P0 production OOM.

Root cause: `app.main.lifespan` used to spawn a `subprocess.run([sys.executable,
"-m", "alembic", "upgrade", "head"], ...)` child process on every startup, in
addition to `alembic upgrade head` already being run once, pre-boot, by
`start-production.sh` before uvicorn is even exec'd (see the docker-compose
`api` service comment and `start-production.sh`).

That child process re-imports alembic plus the entire SQLAlchemy model graph
(via alembic/env.py's model imports) a *second* time, concurrently with the
parent process that already imported everything needed to build the FastAPI
app (20+ domain routers, LiteLLM, boto3, Sentry, prometheus-fastapi-
instrumentator, ...). On Render's free tier (512MB RAM), running parent +
this migration child at the same time was enough to exceed the memory limit
and get OOM-killed a few seconds into every fresh boot -- reproduced locally
via `docker run --memory=512m --memory-swap=512m` against the production
Docker target (apps/api/Dockerfile's `production` stage): the process was
OOMKilled right after logging "Database connection verified", with the
in-process migration subprocess never getting to log anything (its output is
buffered via capture_output=True until it exits, which it never did).

This test guards against that specific pattern coming back: `lifespan` must
never shell out to run migrations, since migrations already run exactly once
via start-production.sh (prod) or an explicit `alembic upgrade head` (dev/CI,
per CLAUDE.md) -- doing it again inside the already-large running process is
pure duplicated memory cost with no correctness benefit.
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.main import app, lifespan


@pytest.mark.asyncio
async def test_lifespan_never_spawns_a_migration_subprocess():
    """`lifespan` must not shell out to `alembic upgrade head` (or anything
    else) via `subprocess.run`/`subprocess.Popen` -- that duplicate,
    in-process migration run is what caused the production OOM. Migrations
    belong solely to start-production.sh / an explicit CI-or-dev step."""
    with patch("subprocess.run") as mock_run, patch("subprocess.Popen") as mock_popen:
        mock_engine_begin = AsyncMock()
        mock_engine_begin.__aenter__.return_value = AsyncMock()
        mock_engine_begin.__aexit__.return_value = None

        with patch("app.main.engine") as mock_engine:
            mock_engine.begin.return_value = mock_engine_begin
            mock_engine.dispose = AsyncMock()

            async with lifespan(app):
                pass

        mock_run.assert_not_called()
        mock_popen.assert_not_called()
