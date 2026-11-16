#!/usr/bin/env bash
# VM resource and certificate checks -> Slack (#alerts-critical), run every 5 minutes
# by ops/vm/systemd/rap-slack-health.timer.
#
#   disk   any of DISK_PATHS above DISK_WARN_PERCENT (default 85)
#   memory used (MemTotal - MemAvailable) above MEM_WARN_PERCENT (default 90)
#   cpu    1-minute load per core above LOAD_WARN_PER_CORE (default 2.0)
#   tls    certificate of each TLS_HOSTS name expiring within TLS_WARN_DAYS (default 14)
#   pg     Postgres database size above PG_WARN_MB (default 40000; 0 = skip)
#
# Settings come from /opt/rap/.env (rendered from Infisical): SLACK_BOT_TOKEN and
# SLACK_CHANNEL_ALERTS_CRITICAL. Each alert repeats at most once per ALERT_REPEAT_MINUTES
# (default 60) via stamp files in STATE_DIR, and a recovery message is posted once.
# Never fails the timer: every probe that cannot run is skipped.
set -u

ENV_FILE="${ENV_FILE:-/opt/rap/.env}"
if [ -r "$ENV_FILE" ]; then
  # Only the variables this script needs, without executing the file.
  while IFS='=' read -r key value; do
    case "$key" in
      SLACK_BOT_TOKEN|SLACK_CHANNEL_ALERTS_CRITICAL|POSTGRES_USER|POSTGRES_DB)
        value="${value%\"}"; value="${value#\"}"
        export "$key=$value" ;;
    esac
  done < "$ENV_FILE"
fi

DISK_PATHS="${DISK_PATHS:-/ /var/lib/docker}"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-85}"
MEM_WARN_PERCENT="${MEM_WARN_PERCENT:-90}"
LOAD_WARN_PER_CORE="${LOAD_WARN_PER_CORE:-2.0}"
TLS_HOSTS="${TLS_HOSTS:-api.remoteaiplatform.com remoteaiplatform.com admin.remoteaiplatform.com}"
TLS_WARN_DAYS="${TLS_WARN_DAYS:-14}"
PG_WARN_MB="${PG_WARN_MB:-40000}"
PG_CONTAINER="${PG_CONTAINER:-$(docker ps -qf label=com.docker.compose.service=postgres 2>/dev/null | head -1)}"
ALERT_REPEAT_MINUTES="${ALERT_REPEAT_MINUTES:-60}"
STATE_DIR="${STATE_DIR:-/var/lib/rap-slack-health}"
HOST="$(hostname -s 2>/dev/null || echo vm)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NOTIFY="${NOTIFY:-$SCRIPT_DIR/../../infra/ops/slack-notify.sh}"

mkdir -p "$STATE_DIR" 2>/dev/null || STATE_DIR="$(mktemp -d)"

send() {
  SLACK_CHANNEL="${SLACK_CHANNEL_ALERTS_CRITICAL:-}" bash "$NOTIFY" "$1" >/dev/null 2>&1 || true
}

# alert KEY MESSAGE: post when new or older than ALERT_REPEAT_MINUTES.
alert() {
  local stamp="$STATE_DIR/$1"
  if [ ! -f "$stamp" ] || [ -n "$(find "$stamp" -mmin +"$ALERT_REPEAT_MINUTES" 2>/dev/null)" ]; then
    send ":warning: [$HOST] $2"
    touch "$stamp"
  fi
}

# clear KEY MESSAGE: post a recovery once if the alert had fired.
clear_alert() {
  local stamp="$STATE_DIR/$1"
  if [ -f "$stamp" ]; then
    rm -f "$stamp"
    send ":white_check_mark: [$HOST] $2"
  fi
}

# ── disk ───────────────────────────────────────────────────────────────────
for path in $DISK_PATHS; do
  [ -d "$path" ] || continue
  used=$(df -P "$path" 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')
  [ -n "$used" ] || continue
  key="disk$(echo "$path" | tr '/' '_')"
  if [ "$used" -ge "$DISK_WARN_PERCENT" ]; then
    alert "$key" "Disk $path at ${used}% (threshold ${DISK_WARN_PERCENT}%)"
  else
    clear_alert "$key" "Disk $path back to ${used}%"
  fi
done

# ── memory ─────────────────────────────────────────────────────────────────
if [ -r /proc/meminfo ]; then
  mem=$(awk '/MemTotal/ {t=$2} /MemAvailable/ {a=$2} END {if (t>0) printf "%d", (t-a)*100/t}' /proc/meminfo)
  if [ -n "$mem" ] && [ "$mem" -ge "$MEM_WARN_PERCENT" ]; then
    alert memory "Memory at ${mem}% (threshold ${MEM_WARN_PERCENT}%)"
  elif [ -n "$mem" ]; then
    clear_alert memory "Memory back to ${mem}%"
  fi
fi

# ── cpu (load per core) ────────────────────────────────────────────────────
if [ -r /proc/loadavg ]; then
  cores=$(nproc 2>/dev/null || echo 1)
  load=$(cut -d' ' -f1 /proc/loadavg)
  if awk -v l="$load" -v c="$cores" -v t="$LOAD_WARN_PER_CORE" 'BEGIN {exit !(l/c > t)}'; then
    alert cpu "CPU load $load on $cores cores (threshold ${LOAD_WARN_PER_CORE}/core)"
  else
    clear_alert cpu "CPU load back to $load"
  fi
fi

# ── TLS certificate expiry ─────────────────────────────────────────────────
if command -v openssl >/dev/null 2>&1; then
  for host in $TLS_HOSTS; do
    end=$(echo | timeout 10 openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null \
      | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    [ -n "$end" ] || continue
    end_s=$(date -d "$end" +%s 2>/dev/null) || continue
    days=$(( (end_s - $(date +%s)) / 86400 ))
    if [ "$days" -le "$TLS_WARN_DAYS" ]; then
      alert "tls_$host" "TLS certificate for $host expires in $days days"
    else
      clear_alert "tls_$host" "TLS certificate for $host renewed ($days days left)"
    fi
  done
fi

# ── Postgres size ──────────────────────────────────────────────────────────
if [ "$PG_WARN_MB" -gt 0 ] && [ -n "$PG_CONTAINER" ]; then
  mb=$(docker exec "$PG_CONTAINER" psql -U "${POSTGRES_USER:-rap}" -d "${POSTGRES_DB:-remote_ai_platform}" -tAc \
    "SELECT pg_database_size(current_database())/1048576" 2>/dev/null | tr -d '[:space:]')
  if [ -n "$mb" ] && [ "$mb" -ge "$PG_WARN_MB" ] 2>/dev/null; then
    alert pg_size "Postgres database is ${mb} MB (threshold ${PG_WARN_MB} MB)"
  elif [ -n "$mb" ]; then
    clear_alert pg_size "Postgres database back to ${mb} MB"
  fi
fi

exit 0
