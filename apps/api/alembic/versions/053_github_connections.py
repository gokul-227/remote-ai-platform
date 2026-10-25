"""Users' own GitHub connections (encrypted token) and OAuth state.

Revision ID: 053_github_connections
Revises: 052_documents
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "053_github_connections"
down_revision = "052_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "github_connections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("github_login", sa.String(100), nullable=False),
        sa.Column("scopes", sa.String(200), nullable=False, server_default=""),
        sa.Column("token_encrypted", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_github_connections_user_id", "github_connections", ["user_id"])
    op.create_table(
        "github_oauth_states",
        sa.Column("state", sa.String(64), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_github_oauth_states_user_id", "github_oauth_states", ["user_id"])
    op.execute("ALTER TABLE github_connections ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE github_oauth_states ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("github_oauth_states")
    op.drop_table("github_connections")
