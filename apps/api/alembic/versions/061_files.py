"""Files application: nodes, versions, shares, stars, activity.

Additive. Object bytes stay in the private files bucket.

Revision ID: 061_files
Revises: 060_search_trgm
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "061_files"
down_revision = "060_search_trgm"
branch_labels = None
depends_on = None


def _ts(name: str, **kw: object) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), **kw)


def upgrade() -> None:
    op.create_table(
        "file_nodes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "parent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("file_nodes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "owner_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "company_id",
            UUID(as_uuid=True),
            sa.ForeignKey("company_profiles.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("mime", sa.String(120), nullable=True),
        sa.Column("size", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("current_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("object_key", sa.String(300), nullable=True),
        _ts("trashed_at", nullable=True),
        _ts("created_at", nullable=False, server_default=sa.func.now()),
        _ts("updated_at", nullable=False, server_default=sa.func.now()),
    )
    for col in ("parent_id", "owner_id", "project_id", "company_id", "trashed_at"):
        op.create_index(f"ix_file_nodes_{col}", "file_nodes", [col])
    op.create_table(
        "file_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "node_id",
            UUID(as_uuid=True),
            sa.ForeignKey("file_nodes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("object_key", sa.String(300), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("mime", sa.String(120), nullable=False),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        _ts("created_at", nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("node_id", "version", name="uq_file_versions_node_version"),
    )
    op.create_index("ix_file_versions_node_id", "file_versions", ["node_id"])
    op.create_table(
        "file_shares",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "node_id",
            UUID(as_uuid=True),
            sa.ForeignKey("file_nodes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("principal_type", sa.String(16), nullable=False),
        sa.Column("principal_id", UUID(as_uuid=True), nullable=True),
        sa.Column("role", sa.String(10), nullable=False, server_default="viewer"),
        sa.Column("token", sa.String(64), nullable=True),
        _ts("expires_at", nullable=True),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        _ts("created_at", nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("token", name="uq_file_shares_token"),
    )
    op.create_index("ix_file_shares_node_id", "file_shares", ["node_id"])
    op.create_index("ix_file_shares_principal_id", "file_shares", ["principal_id"])
    op.create_table(
        "file_stars",
        sa.Column(
            "node_id",
            UUID(as_uuid=True),
            sa.ForeignKey("file_nodes.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        _ts("created_at", nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "file_activity",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "node_id",
            UUID(as_uuid=True),
            sa.ForeignKey("file_nodes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("payload", sa.JSON().with_variant(JSONB, "postgresql"), nullable=False),
        _ts("created_at", nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_file_activity_node_id", "file_activity", ["node_id"])
    op.create_index("ix_file_activity_created_at", "file_activity", ["created_at"])
    for table in ("file_nodes", "file_versions", "file_shares", "file_stars", "file_activity"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in ("file_activity", "file_stars", "file_shares", "file_versions", "file_nodes"):
        op.drop_table(table)
