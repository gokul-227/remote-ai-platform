"""Job preferences, notification preferences and digest queue.

Additive.

Revision ID: 059_preferences
Revises: 058_organisation_members
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "059_preferences"
down_revision = "058_organisation_members"
branch_labels = None
depends_on = None


def _json() -> sa.types.TypeEngine:
    return sa.JSON().with_variant(JSONB, "postgresql")


def upgrade() -> None:
    op.create_table(
        "job_preferences",
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("titles", _json(), nullable=False),
        sa.Column("job_types", _json(), nullable=False),
        sa.Column("remote_scope", sa.String(20), nullable=False, server_default="remote"),
        sa.Column("locations", _json(), nullable=False),
        sa.Column("min_salary", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(10), nullable=False, server_default="USD"),
        sa.Column("notify_new_matches", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_table(
        "notification_preferences",
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("categories", _json(), nullable=False),
        sa.Column("digest_minutes", sa.Integer(), nullable=False, server_default="15"),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_table(
        "notification_digest_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("link_path", sa.String(255), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_notification_digest_items_user_id", "notification_digest_items", ["user_id"]
    )
    op.create_index(
        "ix_notification_digest_items_sent_at", "notification_digest_items", ["sent_at"]
    )
    for table in ("job_preferences", "notification_preferences", "notification_digest_items"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index("ix_notification_digest_items_sent_at", table_name="notification_digest_items")
    op.drop_index("ix_notification_digest_items_user_id", table_name="notification_digest_items")
    op.drop_table("notification_digest_items")
    op.drop_table("notification_preferences")
    op.drop_table("job_preferences")
