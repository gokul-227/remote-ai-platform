"""Add deleted_identities: tombstones for self-deleted accounts (DATA-01).

Revision ID: 037_deleted_identities
Revises: 036_supabase_only_auth

After DELETE /auth/me, the caller's still-valid access token re-entered
get_or_create_user and silently provisioned a new blank account. A tombstone
(hash of the identity subject + deletion time) lets the API refuse tokens
issued before the deletion. New table only: safe to deploy ahead of the code.
"""

from alembic import op
import sqlalchemy as sa


revision = "037_deleted_identities"
down_revision = "036_supabase_only_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "deleted_identities",
        sa.Column("subject_hash", sa.String(length=64), primary_key=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("deleted_identities")
