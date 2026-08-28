#!/bin/sh
set -eu

# Apply all migrations so the database reaches the repository HEAD.
alembic upgrade head

# Seed demo data only when explicitly requested.
# SEED_DEMO_DATA must never be "true" in production (render.yaml sets it to "false").
# The validate_production_settings() check in app.core.config will also fast-fail
# if SEED_DEMO_DATA=true is combined with APP_ENV=production.
if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
    python -m app.scripts.seed_data
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" --proxy-headers --forwarded-allow-ips="*"