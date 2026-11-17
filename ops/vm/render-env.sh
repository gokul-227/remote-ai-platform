#!/usr/bin/env bash
# Build /opt/rap/.env on the VM from Infisical (source of truth), then copy it over SSH.
#   prod:/render-api  existing production settings
#   prod:/vm          VM-only overrides (storage on OCI, Brevo, Slack, push, ...)
# Later keys win. Values are never printed; the local temp file is shredded.
# Usage: ops/vm/render-env.sh [ssh-target]   (default opc@$VM_HOST)
set -euo pipefail
PROJECT="${INFISICAL_PROJECT_ID:?set INFISICAL_PROJECT_ID}"
TARGET="${1:-opc@${VM_HOST:?set VM_HOST}}"
KEY="${VM_SSH_KEY_FILE:-$HOME/.ssh/oci_rap}"
tmp="$(mktemp)"; trap 'rm -P "$tmp" 2>/dev/null || rm -f "$tmp"' EXIT
python3 - "$PROJECT" "$tmp" <<'PY'
import json, subprocess, sys
project, out = sys.argv[1], sys.argv[2]
merged = {}
for path in ("/render-api", "/vm"):
    raw = subprocess.check_output(["infisical", "export", "--projectId", project, "--env", "prod",
                                   "--path", path, "--format", "json", "--silent"])
    for item in json.loads(raw):
        merged[item["key"]] = item["value"]
# The compose file owns these on the VM; drop hosted values so they cannot leak in.
for k in ("REDIS_URL", "CELERY_BROKER_URL", "CELERY_RESULT_BACKEND", "DATABASE_URL"):
    merged.pop(k, None)
with open(out, "w") as f:
    for k in sorted(merged):
        v = merged[k].replace("\n", "\\n")
        f.write(f"{k}={v}\n")
print(f"{len(merged)} settings rendered")
PY
# Keep the VM-generated database password already on the host.
ssh -i "$KEY" -o BatchMode=yes "$TARGET" 'grep -E "^(POSTGRES_PASSWORD|RAP_IMAGE|WEB_IMAGE|ADMIN_IMAGE|CADDY_IMAGE)=" /opt/rap/.env || true' >> "$tmp"
grep -q "^POSTGRES_PASSWORD=." "$tmp" || { echo "POSTGRES_PASSWORD not found on the host; refusing to install an .env without it" >&2; exit 1; }
scp -q -i "$KEY" "$tmp" "$TARGET:/tmp/rap.env.new"
ssh -i "$KEY" -o BatchMode=yes "$TARGET" 'sudo install -m 600 -o opc -g opc /tmp/rap.env.new /opt/rap/.env && rm -f /tmp/rap.env.new && echo "installed $(wc -l < /opt/rap/.env) lines"'
