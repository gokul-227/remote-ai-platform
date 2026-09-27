#!/usr/bin/env bash
# Restore an encrypted backup into a SEPARATE database and bucket set, verify it.
#
# Env: BACKUP_FILE, BACKUP_PASSPHRASE, TARGET_DATABASE_URL (postgresql://...), S3_ENDPOINT,
#      S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKETS (target buckets, same names as backed up),
#      SOURCE_DATABASE_URL (optional; refused as a target), PYTHON (optional)
#      RESET_IDENTITIES=1 only when restoring next to a NEW Supabase Auth project: clears
#      users.auth_subject so each person's next verified sign-in re-attaches their account.
# Exit code is non-zero if any checksum or row count differs.
set -euo pipefail
: "${BACKUP_FILE:?}" "${BACKUP_PASSPHRASE:?}" "${TARGET_DATABASE_URL:?}" "${S3_ENDPOINT:?}" "${S3_BUCKETS:?}"
if [ -n "${SOURCE_DATABASE_URL:-}" ] && [ "$SOURCE_DATABASE_URL" = "$TARGET_DATABASE_URL" ]; then
  echo "refusing to restore over the source database" >&2; exit 2
fi
PYTHON="${PYTHON:-python3}"
HERE="$(cd "$(dirname "$0")" && pwd)"
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

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$BACKUP_FILE" | tar -C "$work" -xf -
( cd "$work/backup" && if command -v sha256sum >/dev/null; then sha256sum --quiet -c SHA256SUMS; else shasum -a 256 --quiet -c SHA256SUMS; fi )
echo "checksums: ok ($(wc -l < "$work/backup/SHA256SUMS" | tr -d ' ') files)"

dump_major="$(sed -n 's/^dump_client_major=//p' "$work/backup/MANIFEST")"
target_major="$(server_major "$TARGET_DATABASE_URL")"
if [ -n "$dump_major" ] && [ "$target_major" -lt "$dump_major" ]; then
  echo "target server is PostgreSQL $target_major but the dump was made by pg_dump $dump_major; restore into $dump_major or newer" >&2
  exit 3
fi
pg pg_restore --no-owner --no-privileges --clean --if-exists --exit-on-error -d "$TARGET_DATABASE_URL" "$work/backup/db.dump"
if [ "${RESET_IDENTITIES:-0}" = "1" ]; then
  pg psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -qc "UPDATE users SET auth_subject = NULL; DELETE FROM deleted_identities;"
  echo "identities reset: accounts re-attach on each person's next verified sign-in"
fi
pg psql "$TARGET_DATABASE_URL" -At -F $'\t' -c \
  "SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint
     FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1" \
  > "$work/restored-counts.tsv"
if [ "${RESET_IDENTITIES:-0}" = "1" ]; then grep -v '^deleted_identities	' "$work/backup/row-counts.tsv" > "$work/expected.tsv"; grep -v '^deleted_identities	' "$work/restored-counts.tsv" > "$work/got.tsv"; else cp "$work/backup/row-counts.tsv" "$work/expected.tsv"; cp "$work/restored-counts.tsv" "$work/got.tsv"; fi
diff -u "$work/expected.tsv" "$work/got.tsv" && echo "row counts: ok ($(wc -l < "$work/expected.tsv" | tr -d ' ') tables)"

uploaded="$("$PYTHON" "$HERE/objects.py" upload "$work/backup/objects")"
mkdir -p "$work/check"; "$PYTHON" "$HERE/objects.py" download "$work/check" >/dev/null
diff <("$PYTHON" "$HERE/objects.py" verify "$work/backup/objects") <("$PYTHON" "$HERE/objects.py" verify "$work/check") \
  && echo "objects: ok ($uploaded re-uploaded, checksums match)"
echo "restore verified in $(( $(date +%s) - start ))s"
