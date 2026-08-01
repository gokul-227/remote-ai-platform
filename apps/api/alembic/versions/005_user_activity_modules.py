"""Add saved jobs, applications, and notifications/project records."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "005_user_activity_modules"
down_revision: Union[str, None] = "004_user_password_hash"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _id():
    return sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()"))


def upgrade() -> None:
    op.create_table("saved_jobs", _id(), sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("job_posts.id", ondelete="CASCADE"), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.UniqueConstraint("user_id", "job_id", name="uq_saved_jobs_user_job"))
    op.create_table("job_applications", _id(), sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("job_posts.id", ondelete="CASCADE"), nullable=False), sa.Column("status", sa.String(30), server_default="submitted", nullable=False), sa.Column("cover_note", sa.Text(), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))


def downgrade() -> None:
    op.drop_table("job_applications")
    op.drop_table("saved_jobs")
