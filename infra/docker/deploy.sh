#!/usr/bin/env bash
# Deploy one commit's images to the production VM, gate on health, roll back
# to the previous tags when the gate fails. Run on the VM (CI calls it over SSH):
#
#   infra/docker/deploy.sh <git-sha>          # deploy that SHA
#   infra/docker/deploy.sh --rollback         # go back to the previous SHA
#
# Image tags live in the env file (RAP_IMAGE, WEB_IMAGE, ADMIN_IMAGE); the
# previous set is kept in $STATE_DIR/previous.env. Database migrations run
# forward only (alembic upgrade head) and are NOT reverted on rollback, so
# migrations must stay backward compatible with the previous release.
#
# postgres/redis are never recreated here (--no-deps): a deploy only swaps the
# application containers. caddy (public 80/443) starts only when the env file
# says EDGE_ENABLED=true, which is set at DNS cut-over.
set -euo pipefail

cd "$(dirname "$0")"
ENV_FILE=${RAP_ENV_FILE:-/opt/rap/.env}
STATE_DIR=${RAP_STATE_DIR:-/opt/rap/state}
REGISTRY=${RAP_REGISTRY:-ghcr.io/gokul-227/remote-ai-platform}
APP_SERVICES=(api worker scheduler web admin)
mkdir -p "$STATE_DIR"

compose() { docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml "$@"; }
env_get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }
env_set() {
  if grep -qE "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}
set_tag() {
  env_set RAP_IMAGE "$REGISTRY-api:$1"
  env_set WEB_IMAGE "$REGISTRY-web:$1"
  env_set ADMIN_IMAGE "$REGISTRY-admin:$1"
}
current_tag() { local img; img=$(env_get WEB_IMAGE); [[ "$img" == *:* ]] && echo "${img##*:}" || true; }

health_gate() {
  local sha=$1 live api_sha
  for _ in $(seq 1 30); do
    live=$(curl -fsS --max-time 5 http://127.0.0.1:3000/api/version 2>/dev/null \
      | python3 -c "import json,sys; print(json.load(sys.stdin).get('git_sha',''))" 2>/dev/null || true)
    api_sha=$(compose exec -T api curl -fsS --max-time 5 http://localhost:8000/health/version 2>/dev/null \
      | python3 -c "import json,sys; print(json.load(sys.stdin).get('git_sha',''))" 2>/dev/null || true)
    if [ "$live" = "$sha" ] && [ "$api_sha" = "$sha" ] \
      && curl -fsS --max-time 5 http://127.0.0.1:3000/ -o /dev/null \
      && curl -fsS --max-time 5 http://127.0.0.1:3000/robots.txt -o /dev/null \
      && curl -fsS --max-time 5 http://127.0.0.1:3002/ | grep -q "Operations console" \
      && compose exec -T api curl -fsS --max-time 10 http://localhost:8000/health/ready -o /dev/null; then
      echo "health gate passed for $sha"
      return 0
    fi
    sleep 5
  done
  echo "health gate FAILED for $sha (web reported '${live:-nothing}', API '${api_sha:-nothing}')" >&2
  return 1
}

roll_out() {
  local sha=$1
  set_tag "$sha"
  compose pull "${APP_SERVICES[@]}"
  compose run --rm --no-deps api alembic upgrade head
  compose up -d --no-deps --remove-orphans "${APP_SERVICES[@]}"
  if [ "$(env_get EDGE_ENABLED)" = "true" ]; then
    compose pull caddy
    compose up -d --no-deps caddy
  fi
}

if [ "${1:-}" = "--rollback" ]; then
  prev=$(cat "$STATE_DIR/previous" 2>/dev/null || true)
  [ -n "$prev" ] || { echo "no previous release recorded" >&2; exit 1; }
  echo "rolling back to $prev"
  set_tag "$prev"
  compose up -d --no-deps "${APP_SERVICES[@]}"
  health_gate "$prev"
  echo "$prev" > "$STATE_DIR/current"
  exit 0
fi

sha=${1:?usage: deploy.sh <git-sha> | --rollback}
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "expected a full 40-character commit SHA" >&2; exit 2; }
prev=$(current_tag)
cp "$ENV_FILE" "$STATE_DIR/env.before-$sha"
chmod 600 "$STATE_DIR/env.before-$sha"

if roll_out "$sha" && health_gate "$sha"; then
  if [ -n "$prev" ] && [ "$prev" != "$sha" ]; then echo "$prev" > "$STATE_DIR/previous"; fi
  echo "$sha" > "$STATE_DIR/current"
  docker image prune -f --filter "until=168h" >/dev/null || true
  echo "deployed $sha"
  exit 0
fi

echo "deploy of $sha failed" >&2
if [ -n "$prev" ] && [ "$prev" != "$sha" ]; then
  echo "rolling back to $prev" >&2
  set_tag "$prev"
  compose up -d --no-deps "${APP_SERVICES[@]}"
  health_gate "$prev" || echo "rollback to $prev is unhealthy too -- manual action needed" >&2
fi
compose logs --tail 80 web api >&2 || true
exit 1
