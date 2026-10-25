#!/usr/bin/env bash
# Run the whole platform locally with test data:
#   product  http://localhost:13000   staff console  http://localhost:13001
#   API      http://localhost:18000   sign-in code for every account: 123456
# Docker runs only Postgres, Redis and MinIO; the API, web app and staff console
# run on the host (apps/api/.venv and npm). Sign-in is a local stand-in for
# Supabase Auth, so no real email is sent. Stop with tools/local/down.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$PWD
LOGS="$ROOT/tools/local/.logs"
mkdir -p "$LOGS"
PY="$ROOT/apps/api/.venv/bin/python"
running() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
start() { # name port command...
  local name=$1 port=$2; shift 2
  if running "$port"; then echo "$name already on :$port"; return; fi
  nohup "$@" >"$LOGS/$name.log" 2>&1 &
  echo $! >"$LOGS/$name.pid"
}

# 1. Data services.
docker compose -p rap-local -f infra/docker/docker-compose.yml up -d postgres redis minio minio-init
for _ in $(seq 1 60); do docker compose -p rap-local -f infra/docker/docker-compose.yml exec -T postgres \
  pg_isready -U remote_ai_platform >/dev/null 2>&1 && break; sleep 2; done

# 2. Mock Supabase Auth.
ISSUER=http://localhost:9999/auth/v1 PORT=9999 start mock-auth 9999 "$PY" tests/e2e/mock-supabase/server.py

# 3. API (migrations first).
export DATABASE_URL=postgresql+asyncpg://remote_ai_platform:remote_ai_platform_dev_password@localhost:5432/remote_ai_platform
export REDIS_URL=redis://localhost:6379/0 MINIO_ENDPOINT=localhost:9000 MINIO_PUBLIC_ENDPOINT=http://localhost:9000
export MINIO_ACCESS_KEY=minioadmin MINIO_SECRET_KEY=minioadmin_dev_password MINIO_SECURE=false
export APP_ENV=development SUPABASE_URL=http://localhost:9999 ADMIN_EMAILS=admin@example.com
export CORS_ORIGINS=http://localhost:13000,http://localhost:13001 RATE_LIMIT_MAX_REQUESTS=1000000 AI_PROVIDER=auto
(cd apps/api && .venv/bin/alembic upgrade head >"$LOGS/migrate.log" 2>&1)
(cd apps/api && start api 18000 .venv/bin/uvicorn app.main:app --port 18000)

# 4. Product and staff console (dev servers).
export NEXT_PUBLIC_API_URL=http://localhost:18000 NEXT_PUBLIC_SUPABASE_URL=http://localhost:9999
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-publishable-key
(cd apps/web && NEXT_TURBOPACK=0 start web 13000 npx next dev --port 13000)
(cd apps/admin && NEXT_PUBLIC_DEPLOY_ENV=development start admin 13001 npx next dev --port 13001)

echo "Waiting for the API…"
for _ in $(seq 1 90); do curl -sf http://localhost:18000/health/ready >/dev/null && break; sleep 2; done

# 5. Test data.
"$PY" tools/local/seed.py

cat <<MSG

Remote AI Platform is running locally (first page load compiles for ~30 s).
  Product        http://localhost:13000
  Staff console  http://localhost:13001
  Sign-in code   123456 (every account)
  Admin          admin@example.com
  Members        alice@example.com, ben@example.com, chloe@example.com, dev@example.com
Logs: tools/local/.logs/
MSG
