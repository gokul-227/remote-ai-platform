"""Track when a sync last saw each imported job, and when it expired.

Revision ID: 039_job_last_seen
Revises: 038_unique_applications

Imported postings stayed listed forever after their source dropped them.
last_seen_at is set whenever a sync sees the job; imported jobs not seen
among their source's recent listings for a while get expired_at (separate from is_active, which stays the
moderation switch). Additive; last_seen_at is backfilled from updated_at.
"""

from alembic import op
import sqlalchemy as sa


revision = "039_job_last_seen"
down_revision = "038_unique_applications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("job_posts", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("job_posts", sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE job_posts SET last_seen_at = COALESCE(updated_at, created_at)")
    op.create_index("ix_job_posts_expired_at", "job_posts", ["expired_at"])


def downgrade() -> None:
    op.drop_index("ix_job_posts_expired_at", table_name="job_posts")
    op.drop_column("job_posts", "expired_at")
    op.drop_column("job_posts", "last_seen_at")
