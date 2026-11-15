"""Company boards per ATS job source.

Additive: one new table, job_source_boards (source, token) with the staff
validation state. Rows are loaded from the bundled board lists by the API.

Revision ID: 075_job_source_boards
Revises: 074_job_search_filters
"""

import sqlalchemy as sa

from alembic import op

revision = "075_job_source_boards"
down_revision = "074_job_search_filters"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "job_source_boards",
        sa.Column("source", sa.String(50), primary_key=True),
        sa.Column("token", sa.String(200), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("status", sa.String(20), nullable=False, server_default="unchecked"),
        sa.Column("job_count", sa.Integer(), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_job_source_boards_source_status", "job_source_boards", ["source", "status"])
    op.execute("ALTER TABLE job_source_boards ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index("ix_job_source_boards_source_status", table_name="job_source_boards")
    op.drop_table("job_source_boards")
