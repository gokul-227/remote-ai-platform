#!/usr/bin/env bash
# Encrypted backup of the app database (public schema) and object storage.
#
# Env: SOURCE_DATABASE_URL (postgresql://... ; not the +asyncpg form), S3_ENDPOINT,
#      S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKETS, BACKUP_PASSPHRASE, OUT_DIR, PYTHON (optional)
# Output: $OUT_DIR/remote-ai-platform-<UTC time>.tar.enc and a .sha256 next to it.
# Never prints credentials. Store the archive outside the providers it backs up.
set -euo pipefail
: "${SOURCE_DATABASE_URL:?}" "${S3_ENDPOINT:?}" "${S3_BUCKETS:?}" "${BACKUP_PASSPHRASE:?}" "${OUT_DIR:?}"
PYTHON="${PYTHON:-python3}"
HERE="$(cd "$(dirname "$0")" && pwd)"
sha() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
# PostgreSQL client tools: local ones (optionally from PG_BIN), or from an official
# image with PG_IMAGE=postgres:<major>-alpine so the client matches the server's
# major version (a dump restores only into a server at least as new as pg_dump).
# With PG_IMAGE, use host.docker.internal instead of localhost in database URLs.
pg() {
  if [ -n "${PG_IMAGE:-}" ]; then
    docker run --rm -i -v "$work:$work" -w "$work" --add-host=host.docker.internal:host-gateway "$PG_IMAGE" "$@"
  else
    "${PG_BIN:+$PG_BIN/}$1" "${@:2}"
  fi
}
server_major() { pg psql "$1" -Atc "SELECT current_setting('server_version_num')::int / 10000"; }
client_major() { pg "$1" --version | sed -E 's/.* ([0-9]+)\..*/\1/'; }
start=$(date +%s)

mkdir -p "$work/backup/objects" "$OUT_DIR"
pg pg_dump --format=custom --no-owner --no-privileges --schema=public \
  --file="$work/backup/db.dump" "$SOURCE_DATABASE_URL"
pg psql "$SOURCE_DATABASE_URL" -At -F $'\t' -c \
  "SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint
     FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1" \
  > "$work/backup/row-counts.tsv"
objects="$("$PYTHON" "$HERE/objects.py" download "$work/backup/objects")"
( cd "$work/backup" && find . -type f ! -name SHA256SUMS | sort | while read -r f; do sha "$f"; done > SHA256SUMS )
printf 'created_at=%s\ntables=%s\nobjects=%s\nsource_server_major=%s\ndump_client_major=%s\n' "$stamp" \
  "$(wc -l < "$work/backup/row-counts.tsv" | tr -d ' ')" "$objects" "$(server_major "$SOURCE_DATABASE_URL")" "$(client_major pg_dump)" \
  > "$work/backup/MANIFEST"

archive="$OUT_DIR/remote-ai-platform-$stamp.tar.enc"
tar -C "$work" -cf - backup | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$archive"
( cd "$OUT_DIR" && sha "$(basename "$archive")" > "$(basename "$archive").sha256" )
echo "backup: $archive ($(du -h "$archive" | cut -f1), $(wc -l < "$work/backup/row-counts.tsv" | tr -d ' ') tables, $objects objects) in $(( $(date +%s) - start ))s"
