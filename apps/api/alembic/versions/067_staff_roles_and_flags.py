"""Least-privilege staff roles and staff overrides for feature flags.

Additive. No rows are created: existing ADMIN accounts keep full access until a
super administrator assigns them a narrower role.

Revision ID: 067_staff_roles_and_flags
Revises: 066_push_subscriptions
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "067_staff_roles_and_flags"
down_revision = "066_push_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("granted_by", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("user_id", "role", name="uq_staff_roles_user_role"),
    )
    op.create_index("ix_staff_roles_user_id", "staff_roles", ["user_id"])
    op.create_table(
        "feature_flag_overrides",
        sa.Column("name", sa.String(60), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("updated_by", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    for table in ("staff_roles", "feature_flag_overrides"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("feature_flag_overrides")
    op.drop_index("ix_staff_roles_user_id", table_name="staff_roles")
    op.drop_table("staff_roles")
