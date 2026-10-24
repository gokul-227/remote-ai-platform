"""Channels: project and group conversations with threads, mentions, unread and mute.

Revision ID: 049_channels
Revises: 048_assistant_actions

Additive: three new tables with RLS enabled and no policies (see 042).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "049_channels"
down_revision = "048_assistant_actions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "channels",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True),
        sa.Column("owner_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("topic", sa.String(255), nullable=True),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_channels_project_id", "channels", ["project_id"])
    op.create_index("ix_channels_owner_id", "channels", ["owner_id"])
    op.create_table(
        "channel_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("channel_id", UUID(as_uuid=True), sa.ForeignKey("channels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("muted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("channel_id", "user_id", name="uq_channel_member"),
    )
    op.create_index("ix_channel_members_channel_id", "channel_members", ["channel_id"])
    op.create_index("ix_channel_members_user_id", "channel_members", ["user_id"])
    op.create_table(
        "channel_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("channel_id", UUID(as_uuid=True), sa.ForeignKey("channels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("channel_messages.id", ondelete="CASCADE"), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("mentions", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("client_token", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("author_id", "client_token", name="uq_channel_message_client_token"),
    )
    for col in ("channel_id", "author_id", "parent_id", "created_at"):
        op.create_index(f"ix_channel_messages_{col}", "channel_messages", [col])
    for table in ("channels", "channel_members", "channel_messages"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("channel_messages")
    op.drop_table("channel_members")
    op.drop_table("channels")
