"""Add users.sessions_revoked_at for sign-out-everywhere under Supabase auth.

Revision ID: 033_user_sessions_revoked_at
Revises: 032_stripe_webhook_events

POST /auth/logout-all bumped users.token_version, but Supabase-issued access
tokens carry no version claim, so in production (AUTH_PROVIDER=supabase)
already-issued access tokens stayed valid until they expired. A timestamp
works for any issuer: tokens whose `iat` is at or before it are rejected.
Nullable and additive, so it is safe to deploy ahead of the code using it.
"""

from alembic import op
import sqlalchemy as sa


revision = "033_user_sessions_revoked_at"
down_revision = "032_stripe_webhook_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("sessions_revoked_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "sessions_revoked_at")
