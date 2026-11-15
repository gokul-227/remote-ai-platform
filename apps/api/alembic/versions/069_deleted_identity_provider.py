"""Record which identity provider a deleted identity belongs to (WorkOS migration).

Existing rows are Supabase subjects. Additive and reversible.

Revision ID: 069_deleted_identity_provider
Revises: 068_backup_runs
"""

import sqlalchemy as sa

from alembic import op

revision = "069_deleted_identity_provider"
down_revision = "068_backup_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "deleted_identities",
        sa.Column("provider", sa.String(32), nullable=False, server_default="supabase"),
    )


def downgrade() -> None:
    op.drop_column("deleted_identities", "provider")
