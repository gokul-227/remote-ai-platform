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

# Restore into a SEPARATE database + buckets, then verify checksums, row counts, objects
PG_IMAGE=postgres:17-alpine BACKUP_FILE=./backups/remote-ai-platform-<time>.tar.enc \
BACKUP_PASSPHRASE=... TARGET_DATABASE_URL=... S3_ENDPOINT=... S3_ACCESS_KEY=... \
S3_SECRET_KEY=... S3_BUCKETS=... PYTHON=apps/api/.venv/bin/python \
  ops/backup/restore.sh
```

- With `PG_IMAGE`, write `host.docker.internal` instead of `localhost` in database URLs.
- A dump restores only into a PostgreSQL server at least as new as the `pg_dump` that
  made it; `restore.sh` refuses otherwise.
- Sign-in identities live in Supabase Auth, not in this backup. Restoring next to a
  **new** Supabase project changes everyone's identity subject: add `RESET_IDENTITIES=1`
  so each person's next verified sign-in re-attaches their account.
- The passphrase is the only key: store it apart from the archives.
