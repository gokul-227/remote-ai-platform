"""Job search filters: structured filter columns, saved job searches.

Additive only:
- job_posts gets small nullable filter columns (workplace_type, seniority,
  country_code, region, tz_min/tz_max, industry, job_function,
  visa_sponsorship, language, derived_version). NULL means unknown. Adding
  nullable columns without defaults is a catalog-only change on PostgreSQL
  (no table rewrite). Values are filled by the batched Celery task
  `jobs.backfill_filters`, never here, so the migration stays instant at
  millions of rows.
- saved_job_searches: a member's saved filter set with alert channels.

Indexes (PostgreSQL only, CREATE INDEX CONCURRENTLY outside the migration
transaction so the table is never locked for writes): every filter index is
partial over live rows (same predicate as migration 070) and compound with
(posted_at DESC, id DESC), so "filter X, newest first" is an index range
scan with no sort; a jsonb_ops GIN on skills serves
`skills ?| array[...]`; a partial salary index covers rows that state one.

Revision ID: 074_job_search_filters
Revises: 073_contact_invites
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "074_job_search_filters"
down_revision = "073_contact_invites"
branch_labels = None
depends_on = None

LIVE = "is_active AND NOT is_deleted AND expired_at IS NULL"

COLUMNS = (
    sa.Column("workplace_type", sa.String(8), nullable=True),
    sa.Column("seniority", sa.String(12), nullable=True),
    sa.Column("country_code", sa.String(2), nullable=True),
    sa.Column("region", sa.String(16), nullable=True),
    sa.Column("tz_min", sa.SmallInteger(), nullable=True),
    sa.Column("tz_max", sa.SmallInteger(), nullable=True),
    sa.Column("industry", sa.String(24), nullable=True),
    sa.Column("job_function", sa.String(24), nullable=True),
    sa.Column("visa_sponsorship", sa.Boolean(), nullable=True),
    sa.Column("language", sa.String(5), nullable=True),
    sa.Column("derived_version", sa.SmallInteger(), nullable=True),
)

RECENT = "posted_at DESC, id DESC"
INDEXES = {
    "ix_job_posts_live_workplace": f"(workplace_type, {RECENT}) WHERE {LIVE}",
    "ix_job_posts_live_seniority": f"(seniority, {RECENT}) WHERE {LIVE} AND seniority IS NOT NULL",
    "ix_job_posts_live_country": f"(country_code, {RECENT}) WHERE {LIVE} AND country_code IS NOT NULL",
    "ix_job_posts_live_region": f"(region, {RECENT}) WHERE {LIVE} AND region IS NOT NULL",
    "ix_job_posts_live_industry": f"(industry, {RECENT}) WHERE {LIVE} AND industry IS NOT NULL",
    "ix_job_posts_live_function": f"(job_function, {RECENT}) WHERE {LIVE} AND job_function IS NOT NULL",
    "ix_job_posts_live_salary": (
        f"(currency, salary_period, salary_max DESC) WHERE {LIVE} AND salary_max IS NOT NULL"
    ),
    "ix_job_posts_live_skills": f"USING gin (skills) WHERE {LIVE}",
    # The backfill walks rows still on an older rule version.
    "ix_job_posts_underived": "(id) WHERE derived_version IS NULL",
}


def upgrade() -> None:
    for column in COLUMNS:
        op.add_column("job_posts", column.copy())
    op.create_table(
        "saved_job_searches",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("params", sa.JSON().with_variant(JSONB, "postgresql"), nullable=False),
        sa.Column("alerts", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("frequency", sa.String(10), nullable=False, server_default="daily"),
        sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_saved_job_searches_user_id", "saved_job_searches", ["user_id"])
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute("ALTER TABLE saved_job_searches ENABLE ROW LEVEL SECURITY")  # DATA-03
    with op.get_context().autocommit_block():
        for name, body in INDEXES.items():
            op.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} ON job_posts {body}")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            for name in INDEXES:
                op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
    op.drop_index("ix_saved_job_searches_user_id", table_name="saved_job_searches")
    op.drop_table("saved_job_searches")
    for column in reversed(COLUMNS):
        op.drop_column("job_posts", column.name)
