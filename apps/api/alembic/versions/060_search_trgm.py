"""Trigram indexes for unified search (PostgreSQL only).

`pg_trgm` is available on Supabase and Neon. Indexes are created without
CONCURRENTLY because Alembic runs inside a transaction; the indexed tables are
small except job_posts (tens of thousands of rows), where the build takes a few
seconds at most. Additive and fully reversible.

Revision ID: 060_search_trgm
Revises: 059_preferences
"""

from alembic import op

revision = "060_search_trgm"
down_revision = "059_preferences"
branch_labels = None
depends_on = None

INDEXES = (
    ("ix_trgm_job_posts_title", "job_posts", "title"),
    ("ix_trgm_job_posts_company_name", "job_posts", "company_name"),
    ("ix_trgm_engineer_profiles_headline", "engineer_profiles", "headline"),
    ("ix_trgm_engineer_profiles_primary_role", "engineer_profiles", "primary_role"),
    ("ix_trgm_company_profiles_name", "company_profiles", "name"),
    ("ix_trgm_projects_title", "projects", "title"),
    ("ix_trgm_documents_title", "documents", "title"),
    ("ix_trgm_channels_name", "channels", "name"),
)


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    for name, table, column in INDEXES:
        op.execute(
            f"CREATE INDEX IF NOT EXISTS {name} ON {table} USING gin ({column} gin_trgm_ops)"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for name, _table, _column in INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {name}")
