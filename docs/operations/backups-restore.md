# Backups and restore

Code and full option reference: [`ops/backup/README.md`](../../ops/backup/README.md).

## What is backed up

- PostgreSQL `public` schema (one `pg_dump` snapshot) plus the list of extensions.
- Object storage bytes and metadata (resumes, assets, deliverables, files buckets).
- A manifest with checksums, row counts and timestamps. The archive is encrypted with
  `BACKUP_PASSPHRASE` (stored apart from the archives).

Not backed up: identity-provider users and sessions (WorkOS/Supabase), database roles/grants, bucket
policies, provider settings. Recreate those from configuration.

## Nightly backup on the VM

- `systemd` timer `rap-backup.timer` (02:30 UTC, persistent) runs `ops/backup/vm/rap-backup.sh`.
- It dumps the local PostgreSQL 17 container over the internal compose network, then
  `ops/backup/vm/offsite.py` uploads to the private OCI bucket `rap-prod-backups` (prefix `db/`) and keeps
  the newest 14 (pruned by the script; OCI's S3 API has no lifecycle rules). The newest 3 stay locally in
  `/var/backups/rap`.
- Settings in `/opt/rap/backup.env` (root, 600); names in `ops/backup/vm/backup.env.example`.
- Each run reports metadata only to `POST /api/v1/ops/backups/report` (`BACKUP_REPORT_TOKEN`). The staff
  console **Backups** view and Slack `#backups` show it. `check_backups` (08:00 UTC) alerts when no
  successful backup in 26 h or no verified restore in 35 days.

Check on the VM: `systemctl list-timers rap-backup.timer` and `journalctl -u rap-backup.service -n 50`.

## Restore drill (monthly, and after any schema or provider change)

1. Fetch: `python ops/backup/vm/offsite.py fetch <archive> <dir>`.
2. Create a scratch database (`CREATE DATABASE restore_drill`) and scratch buckets. Never the live ones.
3. Dry run: `DRY_RUN=1 ops/backup/restore.sh` with `TARGET_DATABASE_URL` pointing at the scratch DB. It
   checks the archive, refuses a non-empty target or the source itself, and prints the target identity.
4. Restore: same command with `CONFIRM_TARGET='<printed identity>'`. It verifies checksums, row counts,
   objects and file references; set `RESTORE_TARGET_LABEL` so the report is recorded.
5. Drop the scratch database and buckets.

## Restoring production

Only after an incident decision. Stop writes (stop api/worker/scheduler), restore into an **empty**
database, then re-apply erasures newer than the archive's `created_at` (`deleted_identities` and the admin
activity log list them) before reopening. The restore never drops anything (`pg_restore` without
`--clean`, single transaction). A dump restores only into a server of the same or newer major version.

## Drill history

| Date | Where | Result |
| --- | --- | --- |
| 2026-11-14 | Isolated E2E stack | 93 tables, 16 objects verified; found missing extensions → archives now record them |
| 2026-11-15 | VM, first nightly archive (85 MB) | Restored in 19 s; checksums, rows, objects, references ok; fixed extension creation under `PG_IMAGE` |
