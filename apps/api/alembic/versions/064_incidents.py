"""Staff incident management.

Revision ID: 064_incidents
Revises: 063_channel_attachments
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "064_incidents"
down_revision = "063_channel_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "incidents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("service", sa.String(120), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "assignee_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")
        ),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "severity IN ('SEV1','SEV2','SEV3','SEV4')", name="ck_incidents_severity"
        ),
        sa.CheckConstraint(
            "status IN ('OPEN','ACKNOWLEDGED','INVESTIGATING','MONITORING','RESOLVED')",
            name="ck_incidents_status",
        ),
        sa.CheckConstraint("version >= 1", name="ck_incidents_version"),
    )
    op.create_index("ix_incidents_status", "incidents", ["status"])
    op.execute("ALTER TABLE incidents ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index("ix_incidents_status", table_name="incidents")
    op.drop_table("incidents")
