"""Add contracts and contract_milestones tables.

Revision ID: 020_contracts
Revises: 019_social_feed
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "020_contracts"
down_revision = "019_social_feed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Contracts table
    op.create_table(
        "contracts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "worker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("scope_description", sa.Text(), nullable=False),
        sa.Column("rate_type", sa.String(30), nullable=False, server_default="FIXED"),  # FIXED, HOURLY, MONTHLY
        sa.Column("rate_amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("status", sa.String(30), nullable=False, server_default="DRAFT"),  # DRAFT, OFFERED, SIGNED, ACTIVE, COMPLETED, TERMINATED, DISPUTED
        sa.Column("terms", sa.Text(), nullable=True),
        sa.Column("client_signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("worker_signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_contracts_client_id", "contracts", ["client_id"])
    op.create_index("ix_contracts_worker_id", "contracts", ["worker_id"])
    op.create_index("ix_contracts_project_id", "contracts", ["project_id"])
    op.create_index("ix_contracts_status", "contracts", ["status"])

    # Contract milestones table
    op.create_table(
        "contract_milestones",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "contract_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contracts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="PENDING"),  # PENDING, IN_PROGRESS, DELIVERED, APPROVED, PAID
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_contract_milestones_contract_id", "contract_milestones", ["contract_id"])


def downgrade() -> None:
    op.drop_table("contract_milestones")
    op.drop_table("contracts")
