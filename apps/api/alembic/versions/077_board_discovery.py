"""ATS board discovery and import throughput.

Additive only:
- new table job_board_candidates (boards found by discovery, before validation);
- job_source_boards gains fail_count (404s in a row) and origin;
- a hash index on job_posts.external_url: cross-source dedup looks up each
  import batch's apply URLs, which was a sequential scan per 1,000 jobs. Hash,
  not btree, because URLs can exceed btree's row-size limit;
- job_sources rows still on the old 10,000 default get the new per-run ceiling
  (runs are bounded by time budget and checkpoints instead).

Revision ID: 077_board_discovery
Revises: 076_merge_scale_and_boards
"""

import sqlalchemy as sa

from alembic import op

revision = "077_board_discovery"
down_revision = "076_merge_scale_and_boards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "job_board_candidates",
        sa.Column("source", sa.String(50), primary_key=True),
        sa.Column("token", sa.String(200), primary_key=True),
        sa.Column("origin", sa.String(40), nullable=False, server_default=""),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("fail_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("job_count", sa.Integer(), nullable=True),
        sa.Column(
            "discovered_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_job_board_candidates_status", "job_board_candidates", ["status"])
    op.execute("ALTER TABLE job_board_candidates ENABLE ROW LEVEL SECURITY")
    op.add_column(
        "job_source_boards",
        sa.Column("fail_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("job_source_boards", sa.Column("origin", sa.String(40), nullable=True))
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_job_posts_external_url_hash "
        "ON job_posts USING hash (external_url)"
    )
    op.execute("UPDATE job_sources SET max_per_run = 250000 WHERE max_per_run = 10000")


def downgrade() -> None:
    op.execute("UPDATE job_sources SET max_per_run = 10000 WHERE max_per_run = 250000")
    op.execute("DROP INDEX IF EXISTS ix_job_posts_external_url_hash")
    op.drop_column("job_source_boards", "origin")
    op.drop_column("job_source_boards", "fail_count")
    op.drop_index("ix_job_board_candidates_status", table_name="job_board_candidates")
    op.drop_table("job_board_candidates")
