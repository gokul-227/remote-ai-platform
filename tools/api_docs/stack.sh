#!/bin/sh
# The API for Postman's "local" environment, with no accounts and no secrets:
# the isolated stack and mock Supabase Auth that CI's E2E job uses, with the
# API on :8000. Sign-in codes are always 123456.
#
#   tools/api_docs/stack.sh up     API on http://localhost:8000, auth on :9999
#   tools/api_docs/stack.sh down
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PYTHON=${PYTHON:-python3}
CACHE="$ROOT/.cache"
PIDFILE="$CACHE/mock-supabase.pid"
compose() {
  docker compose -p rap-e2e -f "$ROOT/infra/docker/docker-compose.yml" -f "$ROOT/tests/e2e/docker-compose.e2e.yml" \
    -f "$ROOT/tools/api_docs/docker-compose.postman.yml" "$@"
}

wait_for() {  # url seconds
  i=0
  until curl -sf -o /dev/null "$1"; do
    i=$((i + 1))
    [ "$i" -ge "$2" ] && { echo "timed out waiting for $1" >&2; return 1; }
    sleep 1
  done
}

case "${1:-}" in
  up)
    mkdir -p "$CACHE"
    if ! { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }; then
      # Tokens name the issuer the API container can reach.
      ISSUER=http://host.docker.internal:9999/auth/v1 PORT=9999 \
        nohup "$PYTHON" "$ROOT/tests/e2e/mock-supabase/server.py" > "$CACHE/mock-supabase.log" 2>&1 &
      echo $! > "$PIDFILE"
    fi
    wait_for http://localhost:9999/auth/v1/.well-known/jwks.json 30
    compose up -d --build postgres redis minio minio-init api
    wait_for http://localhost:8000/health/ready 240
    echo "API: http://localhost:8000 · sign-in: http://localhost:9999 (code 123456) · Postman environment: local"
    ;;
  down)
    compose down
    if [ -f "$PIDFILE" ]; then kill "$(cat "$PIDFILE")" 2>/dev/null || true; rm -f "$PIDFILE"; fi
    ;;
  *)
    echo "usage: $0 up|down" >&2
    exit 2
    ;;
esac
