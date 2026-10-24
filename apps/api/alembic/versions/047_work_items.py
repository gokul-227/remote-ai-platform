"""Work items: type, labels, optimistic version, watchers.

Revision ID: 047_work_items
Revises: 046_support_tickets

Additive with server defaults, so existing rows and the previous app version
keep working during rollout.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "047_work_items"
down_revision = "046_support_tickets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("project_tasks", sa.Column("item_type", sa.String(20), nullable=False, server_default="TASK"))
    op.add_column("project_tasks", sa.Column("labels", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column("project_tasks", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.create_table(
        "task_watchers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("project_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("task_id", "user_id", name="uq_task_watcher"),
    )
    op.create_index("ix_task_watchers_task_id", "task_watchers", ["task_id"])
    op.create_index("ix_task_watchers_user_id", "task_watchers", ["user_id"])
    op.execute("ALTER TABLE task_watchers ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("task_watchers")
    op.drop_column("project_tasks", "version")
    op.drop_column("project_tasks", "labels")
    op.drop_column("project_tasks", "item_type")
