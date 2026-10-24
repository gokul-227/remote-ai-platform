"""Milestone deliverables: code commits, documents, demo links.

Revision ID: 044_deliverables
Revises: 043_email_outbox

Additive: one new table with RLS enabled and no policies (see 042).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "044_deliverables"
down_revision = "043_email_outbox"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "deliverables",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("contract_id", UUID(as_uuid=True), sa.ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("milestone_id", UUID(as_uuid=True), sa.ForeignKey("contract_milestones.id", ondelete="CASCADE"), nullable=False),
        sa.Column("submitted_by_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("supersedes_id", UUID(as_uuid=True), sa.ForeignKey("deliverables.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(30), nullable=False, server_default="SUBMITTED"),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("repo_url", sa.String(512), nullable=True),
        sa.Column("branch", sa.String(255), nullable=True),
        sa.Column("commit_sha", sa.String(40), nullable=True),
        sa.Column("file_key", sa.String(512), nullable=True),
        sa.Column("file_name", sa.String(255), nullable=True),
        sa.Column("file_mime", sa.String(120), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=True),
        sa.Column("demo_url", sa.String(2048), nullable=True),
        sa.Column("environment", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    for col in ("contract_id", "milestone_id", "submitted_by_id", "status"):
        op.create_index(f"ix_deliverables_{col}", "deliverables", [col])
    op.execute("ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("deliverables")
