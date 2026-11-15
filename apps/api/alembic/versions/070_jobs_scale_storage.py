"""Job catalogue at scale: smaller rows, recency/search indexes, cross-source dedup.

Safe and reversible; no job data is removed or rewritten except the new column:
- adds job_posts.dedup_key (md5 of normalized title|company|location) and backfills
  it for imported jobs (one UPDATE; fine at today's ~51k rows);
- drops indexes no query uses: single-column booleans (is_active/is_deleted/
  is_remote), btree title/company_name (the pg_trgm GIN indexes from 060 serve
  search), and the (is_active, ...) composites, all replaced by
- partial indexes over live rows only (active, not deleted, not expired): listing by
  recency, remote listing by recency, and a full-text GIN index over title, company
  and the first 1000 characters of the description;
Descriptions keep the default pglz TOAST compression: measured on PostgreSQL 16 it
stores job text smaller than lz4 (lz4 is faster, not smaller).

PostgreSQL only for the index part (SQLite tests build from models).

Revision ID: 070_jobs_scale_storage
Revises: 068_backup_runs
"""

import sqlalchemy as sa

from alembic import op

revision = "070_jobs_scale_storage"
down_revision = "068_backup_runs"
branch_labels = None
depends_on = None

LIVE = "is_active AND NOT is_deleted AND expired_at IS NULL"
FTS_EXPR = "to_tsvector('simple'::regconfig, title || ' ' || company_name || ' ' || left(description, 1000))"

# name -> definition, recreated on downgrade.
DROPPED = {
    "ix_job_posts_is_active": "(is_active)",
    "ix_job_posts_is_deleted": "(is_deleted)",
    "ix_job_posts_is_remote": "(is_remote)",
    "ix_job_posts_title": "(title)",
    "ix_job_posts_company_name": "(company_name)",
    "ix_job_posts_active_created": "(is_active, created_at)",
    "ix_job_posts_active_posted": "(is_active, posted_at)",
    "ix_job_posts_active_remote_posted": "(is_active, is_remote, posted_at)",
    "ix_job_posts_source_active": "(source, is_active)",
}
ADDED = {
    "ix_job_posts_live_recent": f"(posted_at DESC, id DESC) WHERE {LIVE}",
    "ix_job_posts_live_remote_recent": f"(is_remote, posted_at DESC, id DESC) WHERE {LIVE}",
    "ix_job_posts_live_fts": f"USING gin ({FTS_EXPR}) WHERE {LIVE}",
}

_NORM = "regexp_replace(lower(coalesce({col}, '')), '[^[:alnum:]]+', '', 'g')"


def upgrade() -> None:
    op.add_column("job_posts", sa.Column("dedup_key", sa.String(32), nullable=True))
    op.create_index("ix_job_posts_dedup_key", "job_posts", ["dedup_key"])
    if op.get_bind().dialect.name != "postgresql":
        return
    key = " || '|' || ".join(_NORM.format(col=c) for c in ("title", "company_name", "location"))
    op.execute(
        f"UPDATE job_posts SET dedup_key = md5({key}) "
        "WHERE source <> 'DIRECT' AND dedup_key IS NULL"
    )
    for name in DROPPED:
        op.execute(f"DROP INDEX IF EXISTS {name}")
    for name, body in ADDED.items():
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON job_posts {body}")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for name in ADDED:
            op.execute(f"DROP INDEX IF EXISTS {name}")
        for name, cols in DROPPED.items():
            op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON job_posts {cols}")
    op.drop_index("ix_job_posts_dedup_key", table_name="job_posts")
    op.drop_column("job_posts", "dedup_key")
