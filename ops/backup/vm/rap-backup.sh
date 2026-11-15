#!/usr/bin/env bash
# Nightly backup on the production VM: ops/backup/backup.sh against the local
# PostgreSQL container, then copy the archive to Oracle Object Storage and keep
# the newest ARCHIVE_KEEP archives there (local copies: newest LOCAL_KEEP).
#
# Env file (root-only, chmod 600): /opt/rap/backup.env, see backup.env.example.
# Run by rap-backup.service / rap-backup.timer. Never prints credentials.
set -euo pipefail
ENV_FILE="${RAP_BACKUP_ENV:-/opt/rap/backup.env}"
set -a; . "$ENV_FILE"; set +a
REPO="${RAP_REPO:-/opt/rap/repo}"
: "${OUT_DIR:=/var/backups/rap}" "${LOCAL_KEEP:=3}"
export OUT_DIR

report_failure() {
  REPORT_ERROR="nightly backup failed (exit $1)" "$PYTHON" "$REPO/ops/backup/report.py" backup failed || true
}
trap 'rc=$?; [ $rc -eq 0 ] || report_failure $rc' EXIT

"$PYTHON" "$REPO/ops/backup/vm/offsite.py" ensure-bucket
"$REPO/ops/backup/backup.sh"
archive="$(ls -1 "$OUT_DIR"/remote-ai-platform-*.tar.enc | sort | tail -1)"
"$PYTHON" "$REPO/ops/backup/vm/offsite.py" upload "$archive"
"$PYTHON" "$REPO/ops/backup/vm/offsite.py" prune
# Local copies: keep only the newest few (the offsite bucket is the record).
ls -1 "$OUT_DIR"/remote-ai-platform-*.tar.enc | sort | head -n "-$LOCAL_KEEP" | while read -r f; do
  rm -f "$f" "$f.sha256"
done
