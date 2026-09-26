#!/bin/sh
set -eu

# Apply all migrations so the database reaches the repository HEAD.
alembic upgrade head

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" --proxy-headers --forwarded-allow-ips="*"