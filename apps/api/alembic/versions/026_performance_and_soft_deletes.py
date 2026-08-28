"""Add soft deletion columns and composite performance indexes.

Revision ID: 026_performance_and_soft_deletes
Revises: 025_audit_events
"""

from alembic import op
import sqlalchemy as sa

revision = "026_performance_and_soft_deletes"
down_revision = "025_audit_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add soft delete columns to job_posts
    op.add_column("job_posts", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("job_posts", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_job_posts_is_deleted", "job_posts", ["is_deleted"])
    op.create_index("ix_job_posts_active_created", "job_posts", ["is_active", "created_at"])

    # 2. Add soft delete columns to projects
    op.add_column("projects", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("projects", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_projects_is_deleted", "projects", ["is_deleted"])
    op.create_index("ix_projects_company_status", "projects", ["company_id", "status"])

    # 3. Add soft delete columns to contracts
    op.add_column("contracts", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("contracts", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_contracts_is_deleted", "contracts", ["is_deleted"])
    op.create_index("ix_contracts_status_created", "contracts", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_contracts_status_created", table_name="contracts")
    op.drop_index("ix_contracts_is_deleted", table_name="contracts")
    op.drop_column("contracts", "deleted_at")
    op.drop_column("contracts", "is_deleted")

    op.drop_index("ix_projects_company_status", table_name="projects")
    op.drop_index("ix_projects_is_deleted", table_name="projects")
    op.drop_column("projects", "deleted_at")
    op.drop_column("projects", "is_deleted")

    op.drop_index("ix_job_posts_active_created", table_name="job_posts")
    op.drop_index("ix_job_posts_is_deleted", table_name="job_posts")
    op.drop_column("job_posts", "deleted_at")
    op.drop_column("job_posts", "is_deleted")
