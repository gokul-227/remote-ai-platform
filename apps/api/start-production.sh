#!/bin/sh
set -eu

# Apply all migrations so the database reaches the repository HEAD.
alembic upgrade head

# Seed demo data *before* uvicorn accepts traffic. This ensures the
# fresh-clone experience always has users, jobs, groups, etc. and avoids
# a startup race where an early request poisons the Redis search cache
# with an empty result set.
python -m app.scripts.seed_data

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" --proxy-headers --forwarded-allow-ips="*"