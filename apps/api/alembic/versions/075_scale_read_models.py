"""Scale to 10M jobs / 1M members: read models, hot-path indexes, autovacuum.

Capacity tooling: docs/operations/capacity.md. Additive and
transactional (plain CREATE INDEX inside the migration transaction: CI runs two
migrators at once, and CONCURRENTLY would drop the lock that serialises them).
Large catalogues should build indexes concurrently by hand first (the IF NOT EXISTS makes
the migration a no-op for them), see the capacity runbook.

- job_employer_stats / job_catalogue_stats: read models rebuilt by Celery
  (jobs.refresh_catalogue_stats) for employer pages and common facet searches.
- job_posts: employer pages filter lower(company_name) (no index matched it), and
  the sitemap walks live rows oldest-first with only id/dates/source, which a
  covering index can answer without reading the heap.
- feed (posts by author, newest first), messages (by conversation, newest first;
  unread), notifications (by member, newest first), saved-search alerts (due rows).
- members: sign-in email lookup, people search (trigram on the lower()
  expressions the search uses), public post feed.
- autovacuum thresholds for the high-churn tables: the default 20% scale factor
  means job_posts would wait for 2M dead rows before a vacuum.

Revision ID: 075_scale_read_models
Revises: 074_job_search_filters
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "075_scale_read_models"
down_revision = "074_job_search_filters"
branch_labels = None
depends_on = None

LIVE = "is_active AND NOT is_deleted AND expired_at IS NULL"

INDEXES = {
    "ix_job_posts_live_employer": (
        "job_posts",
        f"(lower(company_name::text), posted_at DESC, id DESC) WHERE {LIVE}",
    ),
    "ix_job_posts_live_sitemap": (
        "job_posts",
        f"(posted_at, id) INCLUDE (updated_at, source) WHERE {LIVE}",
    ),
    # sort=salary: highest stated pay first.
    "ix_job_posts_live_pay": (
        "job_posts",
        f"((coalesce(salary_max, salary_min)) DESC NULLS LAST, posted_at DESC, id DESC) WHERE {LIVE}",
    ),
    # Retention keeps jobs someone saved: EXISTS probes by job_id.
    "ix_saved_jobs_job_id": ("saved_jobs", "(job_id)"),
    "ix_posts_author_created": ("posts", "(author_id, created_at DESC, id DESC)"),
    "ix_messages_conversation_created": ("messages", "(conversation_id, created_at DESC)"),
    "ix_messages_unread": ("messages", "(conversation_id, sender_id) WHERE NOT is_read"),
    "ix_notifications_user_created": ("notifications", "(user_id, created_at DESC)"),
    "ix_posts_public_created": ("posts", "(created_at DESC, id DESC) WHERE visibility = 'PUBLIC'"),
    # Sign-in links a provider account by verified email: lower(email) lookups
    # need a matching expression index.
    "ix_users_email_lower": ("users", "(lower(email::text))"),
    # People search matches lower(col) LIKE '%term%' (engineers/repository.py);
    # the existing trigram indexes are on the raw columns and never matched.
    "ix_trgm_engineer_profiles_lower_headline": (
        "engineer_profiles",
        "USING gin (lower(headline::text) gin_trgm_ops)",
    ),
    "ix_trgm_engineer_profiles_lower_role": (
        "engineer_profiles",
        "USING gin (lower(primary_role::text) gin_trgm_ops)",
    ),
    "ix_trgm_engineer_profiles_lower_bio": (
        "engineer_profiles",
        "USING gin (lower(bio) gin_trgm_ops)",
    ),
    "ix_trgm_engineer_profiles_skills": (
        "engineer_profiles",
        "USING gin ((skills::text) gin_trgm_ops)",
    ),
    # People search lists newest-updated public profiles first: for common terms
    # walking this index can avoid fetching every trigram match.
    "ix_engineer_profiles_public_recent": (
        "engineer_profiles",
        "(updated_at DESC, id DESC) WHERE is_public",
    ),
    "ix_saved_job_searches_due": (
        "saved_job_searches",
        "(coalesce(last_notified_at, created_at), id) WHERE alerts",
    ),
}

# (table, reloptions). Small scale factors plus fixed thresholds: vacuum after
# ~1-2% of the table changes instead of 20%.
AUTOVACUUM = {
    "job_posts": "autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 5000, "
    "autovacuum_analyze_scale_factor = 0.01, autovacuum_analyze_threshold = 5000, "
    "autovacuum_vacuum_insert_scale_factor = 0.02",
    "notifications": "autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02",
    "messages": "autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02",
    "task_runs": "autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05",
    "email_outbox": "autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05",
    "outbox_events": "autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05",
    "job_employer_stats": "autovacuum_vacuum_scale_factor = 0.1",
}
RESET = {
    table: ", ".join(opt.split("=")[0].strip() for opt in opts.split(","))
    for table, opts in AUTOVACUUM.items()
}


def upgrade() -> None:
    op.create_table(
        "job_employer_stats",
        sa.Column("slug", sa.String(80), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("job_count", sa.Integer(), nullable=False),
        sa.Column("latest_posted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "job_catalogue_stats",
        sa.Column("key", sa.String(255), primary_key=True),
        sa.Column("payload", sa.JSON().with_variant(JSONB, "postgresql"), nullable=False),
        sa.Column(
            "computed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    if op.get_bind().dialect.name != "postgresql":
        return
    for table in ("job_employer_stats", "job_catalogue_stats"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")  # DATA-03
    for name, (table, body) in INDEXES.items():
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} {body}")
    for table, opts in AUTOVACUUM.items():
        op.execute(f"ALTER TABLE {table} SET ({opts})")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for table, opts in RESET.items():
            op.execute(f"ALTER TABLE IF EXISTS {table} RESET ({opts})")
        for name in INDEXES:
            op.execute(f"DROP INDEX IF EXISTS {name}")
    op.drop_table("job_catalogue_stats")
    op.drop_table("job_employer_stats")
