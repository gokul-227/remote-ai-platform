"""Add company projects and user notifications."""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "006_projects_notifications"
down_revision: Union[str, None] = "005_user_activity_modules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _id():
    return sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()"))


def upgrade() -> None:
    op.create_table("projects", _id(), sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_profiles.id", ondelete="CASCADE"), nullable=False), sa.Column("title", sa.String(255), nullable=False), sa.Column("description", sa.Text(), nullable=False), sa.Column("status", sa.String(30), server_default="open", nullable=False), sa.Column("technologies", postgresql.JSONB(), server_default="[]", nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_table("notifications", _id(), sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("title", sa.String(255), nullable=False), sa.Column("body", sa.Text(), nullable=False), sa.Column("kind", sa.String(50), server_default="system", nullable=False), sa.Column("is_read", sa.Boolean(), server_default=sa.false(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("projects")
