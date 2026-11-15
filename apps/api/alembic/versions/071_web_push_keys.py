"""Web Push (VAPID) subscription keys on push_subscriptions.

Additive: two nullable columns. `token` now holds the push endpoint URL; rows
without keys are legacy FCM tokens and are revoked by the sender.

Revision ID: 071_web_push_keys
Revises: 068_backup_runs
"""

import sqlalchemy as sa

from alembic import op

revision = "071_web_push_keys"
down_revision = "068_backup_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("push_subscriptions", sa.Column("p256dh", sa.String(128), nullable=True))
    op.add_column("push_subscriptions", sa.Column("auth_secret", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("push_subscriptions", "auth_secret")
    op.drop_column("push_subscriptions", "p256dh")
