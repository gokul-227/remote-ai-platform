# Database migrations

Alembic, in `apps/api/alembic/versions/` (numbered `NNN_short_name.py`).

## Rules

1. **Additive only:** new tables, nullable columns, indexes. No destructive change in the same release that
   stops using a column; drop later, after a release that no longer reads it.
2. **Backward compatible:** production applies migrations before swapping containers and never downgrades on
   rollback, so the previous release must run on the new schema.
3. Revision ids fit `VARCHAR(32)`.
4. No data rewrites inside migrations; backfills run as idempotent tasks.
5. `downgrade()` drops exactly what `upgrade()` added — used locally only.
6. Round-trip on a disposable PostgreSQL before committing:
   `alembic upgrade head && alembic downgrade -1 && alembic upgrade head`.
7. Extensions used (`pg_trgm`, `uuid-ossp`, `pg_stat_statements`) must exist before restore; backups record
   them.
8. Large indexes on hot tables (`job_posts`): create with `CONCURRENTLY` from a one-off script, not inside
   an Alembic transaction.

## Applying

- Local: `.venv/bin/alembic upgrade head`.
- Production: `deploy.sh` runs `alembic upgrade head` in a one-off api container before starting the new
  release. A failing migration fails the deploy and the old containers keep serving.
