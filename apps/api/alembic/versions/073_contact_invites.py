"""Opt-in contact invitations and the stop-invites list.

Additive: two new tables.
- contact_invites: invitations a member chose to email (email hash; the
  plaintext address only until the send attempt finishes).
- invite_suppressions: hashes of addresses that asked for no invitations.

Revision ID: 073_contact_invites
Revises: 072_news_and_invites
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "073_contact_invites"
down_revision = "072_news_and_invites"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contact_invites",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "inviter_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email_hash", sa.String(64), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("inviter_id", "email_hash", name="uq_contact_invite_pair"),
    )
    op.create_index("ix_contact_invites_inviter_id", "contact_invites", ["inviter_id"])
    op.create_index("ix_contact_invites_email_hash", "contact_invites", ["email_hash"])
    op.create_table(
        "invite_suppressions",
        sa.Column("email_hash", sa.String(64), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.execute("ALTER TABLE contact_invites ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE invite_suppressions ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("invite_suppressions")
    op.drop_index("ix_contact_invites_email_hash", table_name="contact_invites")
    op.drop_index("ix_contact_invites_inviter_id", table_name="contact_invites")
    op.drop_table("contact_invites")
