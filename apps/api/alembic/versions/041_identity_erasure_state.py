"""Durable identity-provider erasure state on deleted_identities (DATA-04).

Revision ID: 041_identity_erasure_state
Revises: 040_user_blocks

Deleting the Supabase user was a best-effort call after the app data was
committed; a failure was only logged. The old refresh token then kept working,
its refreshed access token postdated the tombstone and re-created the account.
The tombstone now remembers the subject until the provider erasure succeeds so
it can be retried. Nullable/defaulted columns only: safe ahead of the code.
"""

from alembic import op
import sqlalchemy as sa


revision = "041_identity_erasure_state"
down_revision = "040_user_blocks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("deleted_identities", sa.Column("pending_subject", sa.String(length=64), nullable=True))
    op.add_column("deleted_identities", sa.Column("provider_erased_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "deleted_identities",
        sa.Column("provider_attempts", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("deleted_identities", sa.Column("last_error", sa.String(length=64), nullable=True))
    op.create_index(
        "ix_deleted_identities_pending",
        "deleted_identities",
        ["pending_subject"],
        postgresql_where=sa.text("pending_subject IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_deleted_identities_pending", table_name="deleted_identities")
    for col in ("last_error", "provider_attempts", "provider_erased_at", "pending_subject"):
        op.drop_column("deleted_identities", col)
