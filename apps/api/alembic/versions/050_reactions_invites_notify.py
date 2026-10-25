"""Post reactions, invitation lifecycle fields, channel notification levels.

Revision ID: 050_reactions_invites_notify
Revises: 049_channels

Additive columns with server defaults: existing likes become LIKE reactions,
existing invitations have no expiry, existing channel members get MENTIONS.
"""

import sqlalchemy as sa

from alembic import op

revision = "050_reactions_invites_notify"
down_revision = "049_channels"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("post_likes", sa.Column("reaction", sa.String(20), nullable=False, server_default="LIKE"))
    op.add_column("job_applications", sa.Column("invite_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("job_applications", sa.Column("decline_reason", sa.String(30), nullable=True))
    op.add_column("job_applications", sa.Column("revised_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("channel_members", sa.Column("notify_level", sa.String(10), nullable=False, server_default="MENTIONS"))


def downgrade() -> None:
    op.drop_column("channel_members", "notify_level")
    op.drop_column("job_applications", "revised_at")
    op.drop_column("job_applications", "decline_reason")
    op.drop_column("job_applications", "invite_expires_at")
    op.drop_column("post_likes", "reaction")
