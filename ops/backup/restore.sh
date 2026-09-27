#!/usr/bin/env bash
# Restore an encrypted backup into a SEPARATE, EMPTY database and empty buckets, then verify it.
#
# Env: BACKUP_FILE, BACKUP_PASSPHRASE, TARGET_DATABASE_URL (postgresql://...), S3_ENDPOINT,
#      S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKETS (target buckets, same names as backed up),
#      SOURCE_DATABASE_URL (optional; refused as a target by server identity, not by URL text),
#      PYTHON (optional)
#      DRY_RUN=1 checks the archive and the target and prints the target identity; writes nothing.
#      CONFIRM_TARGET=<identity printed by the dry run> is required for a real restore.
#      RESET_IDENTITIES=1 only when restoring next to a NEW Supabase Auth project: clears
#      users.auth_subject so each person's next verified sign-in re-attaches their account.
# Safety (OPS-06): the target database must have no tables in `public` and every target
# bucket must be empty or absent; nothing is dropped or overwritten (no pg_restore --clean).
# Exit codes: 2 target is the source, 3 version mismatch, 4 target not empty,
#             5 confirmation missing/wrong, 6 archive checksum; non-zero on any verification diff.
set -euo pipefail
: "${BACKUP_FILE:?}" "${BACKUP_PASSPHRASE:?}" "${TARGET_DATABASE_URL:?}" "${S3_ENDPOINT:?}" "${S3_BUCKETS:?}"
PYTHON="${PYTHON:-python3}"
HERE="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
sha() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
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
# The server's own identity: cluster system identifier (when readable) + database name.
# Two different URLs (pooler vs direct, alias hostnames) for one database resolve the same.
db_identity() {
  pg psql "$1" -v ON_ERROR_STOP=1 -Atc "SELECT
    CASE WHEN has_function_privilege('pg_control_system()', 'execute')
         THEN (SELECT system_identifier::text FROM pg_control_system())
         ELSE 'addr:' || coalesce(host(inet_server_addr()), 'local') || ':' || coalesce(inet_server_port()::text, '') END
    || '/' || current_database()"
}
start=$(date +%s)

# 1. Archive integrity: outer checksum (written by backup.sh), then inner per-file checksums.
if [ -f "$BACKUP_FILE.sha256" ]; then
  expected="$(cut -d' ' -f1 < "$BACKUP_FILE.sha256")"
  actual="$(sha "$BACKUP_FILE" | cut -d' ' -f1)"
  [ "$expected" = "$actual" ] || { echo "archive checksum does not match $BACKUP_FILE.sha256" >&2; exit 6; }
  echo "archive checksum: ok"
elif [ "${ALLOW_MISSING_ARCHIVE_SHA:-0}" != "1" ]; then
  echo "no $BACKUP_FILE.sha256 next to the archive (set ALLOW_MISSING_ARCHIVE_SHA=1 to continue)" >&2; exit 6
fi
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$BACKUP_FILE" | tar -C "$work" -xf -
( cd "$work/backup" && if command -v sha256sum >/dev/null; then sha256sum --quiet -c SHA256SUMS; else shasum -a 256 --quiet -c SHA256SUMS; fi )
echo "checksums: ok ($(wc -l < "$work/backup/SHA256SUMS" | tr -d ' ') files)"
sed 's/^/manifest: /' "$work/backup/MANIFEST"

# 2. Target is not the source, and is empty.
target_id="$(db_identity "$TARGET_DATABASE_URL")"
echo "target database identity: $target_id"
if [ -n "${SOURCE_DATABASE_URL:-}" ]; then
  if [ "$(db_identity "$SOURCE_DATABASE_URL")" = "$target_id" ]; then
    echo "refusing: the target is the source database" >&2; exit 2
  fi
fi
tables="$(pg psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
if [ "$tables" != "0" ]; then
  echo "refusing: target database has $tables table(s) in public; restore only into an empty database" >&2; exit 4
fi
echo "target database: empty"
"$PYTHON" "$HERE/objects.py" preflight

dump_major="$(sed -n 's/^dump_client_major=//p' "$work/backup/MANIFEST")"
target_major="$(server_major "$TARGET_DATABASE_URL")"
if [ -n "$dump_major" ] && [ "$target_major" -lt "$dump_major" ]; then
  echo "target server is PostgreSQL $target_major but the dump was made by pg_dump $dump_major; restore into $dump_major or newer" >&2
  exit 3
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "dry run: nothing written. To restore, set CONFIRM_TARGET='$target_id'"
  exit 0
fi
if [ "${CONFIRM_TARGET:-}" != "$target_id" ]; then
  echo "refusing: set CONFIRM_TARGET to the target identity printed by DRY_RUN=1" >&2; exit 5
fi

# 3. Restore (into the empty target; nothing is dropped).
# The empty target already has a `public` schema: skip only that entry of the dump.
# One transaction: a failed restore leaves the target empty and re-runnable.
pg pg_restore --list "$work/backup/db.dump" | grep -Ev '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public ' > "$work/toc.list"
pg pg_restore --no-owner --no-privileges --exit-on-error --single-transaction --use-list="$work/toc.list" \
  -d "$TARGET_DATABASE_URL" "$work/backup/db.dump"
if [ "${RESET_IDENTITIES:-0}" = "1" ]; then
  pg psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -qc "UPDATE users SET auth_subject = NULL; DELETE FROM deleted_identities;"
  echo "identities reset: accounts re-attach on each person's next verified sign-in"
fi

# 4. Verify row counts (expected counts come from the dump's own snapshot).
pg psql "$TARGET_DATABASE_URL" -At -F $'\t' -c \
  "SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint
     FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'" \
  | LC_ALL=C sort > "$work/restored-counts.tsv"
LC_ALL=C sort "$work/backup/row-counts.tsv" > "$work/expected-all.tsv"
if [ "${RESET_IDENTITIES:-0}" = "1" ]; then
  grep -v '^deleted_identities	' "$work/expected-all.tsv" > "$work/expected.tsv"; grep -v '^deleted_identities	' "$work/restored-counts.tsv" > "$work/got.tsv"
else
  cp "$work/expected-all.tsv" "$work/expected.tsv"; cp "$work/restored-counts.tsv" "$work/got.tsv"
fi
diff -u "$work/expected.tsv" "$work/got.tsv" && echo "row counts: ok ($(wc -l < "$work/expected.tsv" | tr -d ' ') tables)"

# 5. Objects: upload with metadata, download again, compare checksums.
uploaded="$("$PYTHON" "$HERE/objects.py" upload "$work/backup/objects")"
mkdir -p "$work/check"; "$PYTHON" "$HERE/objects.py" download "$work/check" >/dev/null
diff <("$PYTHON" "$HERE/objects.py" verify "$work/backup/objects") <("$PYTHON" "$HERE/objects.py" verify "$work/check") \
  && echo "objects: ok ($uploaded re-uploaded, checksums match)"

# 6. Database references to objects that the backup does not contain (deleted between dump and listing).
pg psql "$TARGET_DATABASE_URL" -At -c "SELECT resume_url FROM engineer_profiles WHERE resume_url IS NOT NULL" \
  > "$work/refs.txt" 2>/dev/null || : > "$work/refs.txt"
missing="$("$PYTHON" "$HERE/objects.py" refcheck "$work/backup/objects" "$work/refs.txt" | wc -l | tr -d ' ')"
if [ "$missing" != "0" ]; then
  echo "warning: $missing stored file reference(s) have no object in this backup (deleted after the dump)" >&2
else
  echo "object references: ok"
fi
echo "restore verified in $(( $(date +%s) - start ))s"
