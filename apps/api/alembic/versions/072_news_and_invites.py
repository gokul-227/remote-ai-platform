"""External reading items and personal invite links.

Additive: two new tables, no changes to existing data.
- news_items: attributed external links (title, short excerpt, link, source,
  published_at, tags); deduplicated by canonical URL hash; pruned after 30 days.
- member_invites: personal invite links (token hash only, no invitee address).

Revision ID: 072_news_and_invites
Revises: 071_web_push_keys
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "072_news_and_invites"
down_revision = "071_web_push_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "news_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("url", sa.String(2048), nullable=False),
        sa.Column("url_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("discussion_url", sa.String(2048), nullable=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("excerpt", sa.String(300), nullable=True),
        sa.Column("tags", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_news_items_source", "news_items", ["source"])
    op.create_index("ix_news_items_published_at", "news_items", ["published_at"])
    op.create_index("ix_news_items_fetched_at", "news_items", ["fetched_at"])
    op.create_table(
        "member_invites",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "inviter_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("uses", sa.Integer, nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_member_invites_inviter_id", "member_invites", ["inviter_id"])
    # Same posture as every public table: RLS on, no policies.
    op.execute("ALTER TABLE news_items ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE member_invites ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index("ix_member_invites_inviter_id", table_name="member_invites")
    op.drop_table("member_invites")
    op.drop_index("ix_news_items_fetched_at", table_name="news_items")
    op.drop_index("ix_news_items_published_at", table_name="news_items")
    op.drop_index("ix_news_items_source", table_name="news_items")
    op.drop_table("news_items")
