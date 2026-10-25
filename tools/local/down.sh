#!/usr/bin/env bash
# Stop the local demo started by tools/local/up.sh and delete its data.
set -uo pipefail
cd "$(dirname "$0")/../.."
for p in tools/local/.logs/*.pid; do [ -f "$p" ] && pkill -P "$(cat "$p")" 2>/dev/null; kill "$(cat "$p")" 2>/dev/null; rm -f "$p"; done
docker compose -p rap-local -f infra/docker/docker-compose.yml down -v
