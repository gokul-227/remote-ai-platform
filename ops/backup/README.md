# Backup and restore

Encrypted backups of the app database (`public` schema) and object storage, and a
restore that verifies itself. Supabase's free plan has no automatic backups, so run
these from a machine or runner **outside** Supabase, Render and Cloudflare, and keep the
archives somewhere else again.

```bash
# Backup (DATABASE URL in libpq form: postgresql://..., not postgresql+asyncpg://)
PG_IMAGE=postgres:17-alpine \            # client = source server's major version
SOURCE_DATABASE_URL=... S3_ENDPOINT=... S3_ACCESS_KEY=... S3_SECRET_KEY=... \
S3_BUCKETS=remote-ai-platform-resumes,remote-ai-platform-assets \
BACKUP_PASSPHRASE=... OUT_DIR=./backups PYTHON=apps/api/.venv/bin/python \
  ops/backup/backup.sh

# Restore into a SEPARATE, EMPTY database + empty buckets. First a dry run: checks the
# archive, refuses a target that is the source (by server identity) or is not empty,
# and prints the target identity. Nothing is written.
PG_IMAGE=postgres:17-alpine BACKUP_FILE=./backups/remote-ai-platform-<time>.tar.enc \
BACKUP_PASSPHRASE=... TARGET_DATABASE_URL=... SOURCE_DATABASE_URL=... S3_ENDPOINT=... \
S3_ACCESS_KEY=... S3_SECRET_KEY=... S3_BUCKETS=... PYTHON=apps/api/.venv/bin/python \
DRY_RUN=1 ops/backup/restore.sh

# Then the restore itself, confirming the identity the dry run printed; it verifies
# checksums, row counts, objects (bytes + content type/metadata) and file references.
... CONFIRM_TARGET='<printed identity>' ops/backup/restore.sh
```

- With `PG_IMAGE`, write `host.docker.internal` instead of `localhost` in database URLs.
- A dump restores only into a PostgreSQL server at least as new as the `pg_dump` that
  made it; `restore.sh` refuses otherwise.
- Sign-in identities live in Supabase Auth, not in this backup. Restoring next to a
  **new** Supabase project changes everyone's identity subject: add `RESET_IDENTITIES=1`
  so each person's next verified sign-in re-attaches their account.
- The passphrase is the only key: store it apart from the archives.
- Consistency: the database is one `pg_dump` snapshot and the expected row counts are
  read from the dump, so they always agree. Objects are listed after the dump: files
  uploaded meanwhile are harmless extras; files deleted meanwhile are reported by the
  restore as dangling references. The manifest records both times.
- Not in the backup: Supabase Auth users/sessions, database grants and roles, storage
  bucket policies and provider settings. Recreate those from configuration.
- Erasure: a backup taken before an account was deleted still contains it. Before
  restoring into production, re-apply deletions made after the backup's `created_at`
  (the `deleted_identities` rows and the admin activity log of the live database list them).
- The restore never drops anything (`pg_restore` without `--clean`, single transaction).
  Object keys from the store are refused if they would write outside the backup folder.

## Run evidence in the staff console

Set `BACKUP_REPORT_URL` (the API base URL) and `BACKUP_REPORT_TOKEN` (the same value as the API's
`BACKUP_REPORT_TOKEN`, kept in Infisical) and both scripts report each successful run to
`POST /api/v1/ops/backups/report`. Only metadata is sent: archive name, SHA-256, size, table and object
counts, and for restores a label from `RESTORE_TARGET_LABEL`. The console's Backups view then shows the
last backup and last verified restore; "ok" needs a backup within 26 hours and a verified restore within
35 days. Reporting is optional and a failed report never fails the run.

## Restore drill (2026-11-14)

A full backup and restore of the isolated E2E stack into a fresh PostgreSQL 16 and MinIO verified
93 tables (row counts equal), 16 objects (checksums equal) and no dangling file references. The drill
found that a public-schema dump does not create extensions, so the search indexes (`pg_trgm`) failed to
restore; backups now record `extensions.txt` and restores create those extensions first. Repeat the drill
after any schema or provider change, and monthly against production backups (the console shows the date).

## Nightly backups on the production VM

`ops/backup/vm/` holds the VM setup: `rap-backup.sh` (runs `backup.sh` against the local PostgreSQL
container over the `rap-prod_internal` network with `PG_IMAGE=postgres:17 PG_DOCKER_NETWORK=rap-prod_internal`,
then `offsite.py` copies the archive to the private Oracle Object Storage bucket `rap-prod-backups` and keeps
the newest 14), `rap-backup.service` / `rap-backup.timer` (02:30 UTC) and `backup.env.example` (names of
`/opt/rap/backup.env`, root-only). With `PG_IMAGE`, every client call is `docker run -i`, which reads
stdin: never call `pg` inside a `while read` loop without `</dev/null`.

Restore drill (2026-11-15, VM): the first nightly archive (85 MB, 93 tables, 5 objects) fetched from
`rap-prod-backups` and restored into a scratch database in 19 s: checksums, row counts (93 tables), objects and
references all ok. It found that `restore.sh` created only the first extension under `PG_IMAGE` (fixed).
