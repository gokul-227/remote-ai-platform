#!/bin/sh
set -eu

# Apply all migrations so the database reaches the repository HEAD.
alembic upgrade head

# --no-access-log: uvicorn's access log records full URLs, query strings
# included (tokens, signed URLs); RequestLoggingMiddleware already logs
# method, path, status and duration without them.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" --proxy-headers --forwarded-allow-ips="*" --no-access-log