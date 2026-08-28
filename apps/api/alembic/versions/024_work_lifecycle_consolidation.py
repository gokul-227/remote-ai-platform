"""Consolidate work and milestone lifecycle linking projects to contracts.

Revision ID: 024_work_lifecycle_consolidation
Revises: 023_auth_security_tokens
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "024_work_lifecycle_consolidation"
down_revision = "023_auth_security_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add contract_id to projects
    op.add_column(
        "projects",
        sa.Column(
            "contract_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contracts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_projects_contract_id", "projects", ["contract_id"])

    # Add contract_milestone_id, due_date, and amount to milestones
    op.add_column(
        "milestones",
        sa.Column(
            "contract_milestone_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contract_milestones.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("milestones", sa.Column("due_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("milestones", sa.Column("amount", sa.Float(), nullable=True))
    op.create_index("ix_milestones_contract_milestone_id", "milestones", ["contract_milestone_id"])


def downgrade() -> None:
    op.drop_index("ix_milestones_contract_milestone_id", table_name="milestones")
    op.drop_column("milestones", "amount")
    op.drop_column("milestones", "due_date")
    op.drop_column("milestones", "contract_milestone_id")
    op.drop_index("ix_projects_contract_id", table_name="projects")
    op.drop_column("projects", "contract_id")
