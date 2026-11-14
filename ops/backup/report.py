"""Report a backup or restore-verify run to the API (optional, never fatal).

Usage: report.py backup|restore_verify success|failed [archive_path]
Environment: BACKUP_REPORT_URL (API base, e.g. https://api.example.com), BACKUP_REPORT_TOKEN,
BACKUP_ENVIRONMENT (default production), REPORT_TABLES, REPORT_OBJECTS, REPORT_TARGET_LABEL,
REPORT_STARTED_AT, REPORT_ERROR. Sends metadata only: never contents or credentials.
"""

import hashlib
import json
import os
import sys
import urllib.request
from datetime import UTC, datetime


def main() -> int:
    url, token = os.environ.get("BACKUP_REPORT_URL", ""), os.environ.get("BACKUP_REPORT_TOKEN", "")
    if not url or not token:
        print("report: skipped (BACKUP_REPORT_URL or BACKUP_REPORT_TOKEN not set)")
        return 0
    kind, status = sys.argv[1], sys.argv[2]
    body: dict[str, object] = {
        "kind": kind,
        "status": status,
        "environment": os.environ.get("BACKUP_ENVIRONMENT", "production"),
        "finished_at": datetime.now(UTC).isoformat(),
    }
    if len(sys.argv) > 3 and os.path.isfile(sys.argv[3]):
        path = sys.argv[3]
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        body.update(
            archive_name=os.path.basename(path),
            sha256=h.hexdigest(),
            size_bytes=os.path.getsize(path),
        )
    for env, key in (("REPORT_TABLES", "tables"), ("REPORT_OBJECTS", "objects")):
        if os.environ.get(env, "").isdigit():
            body[key] = int(os.environ[env])
    for env, key in (
        ("REPORT_TARGET_LABEL", "target_label"),
        ("REPORT_STARTED_AT", "started_at"),
        ("REPORT_ERROR", "error"),
    ):
        if os.environ.get(env):
            body[key] = os.environ[env][:300]
    req = urllib.request.Request(
        url.rstrip("/") + "/api/v1/ops/backups/report",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-Backup-Report-Token": token},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:  # noqa: S310 (operator-configured https URL)
            print(f"report: recorded ({r.status})")
    except Exception as exc:  # reporting must never fail the backup itself
        print(
            f"report: failed ({type(exc).__name__}); the run itself is unaffected", file=sys.stderr
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
