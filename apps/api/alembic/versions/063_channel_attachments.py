"""File references on channel and direct messages; Files remains the access authority."""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "063_channel_attachments"
down_revision = "061_files"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("attachment_ids", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "channel_messages",
        sa.Column("attachment_ids", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )


def downgrade() -> None:
    op.drop_column("channel_messages", "attachment_ids")
    op.drop_column("messages", "attachment_ids")
