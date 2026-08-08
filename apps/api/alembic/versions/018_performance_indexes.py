"""Add composite indexes for high-frequency filtered reads."""

from typing import Sequence, Union

from alembic import op

revision: str = "018_performance_indexes"
down_revision: Union[str, None] = "017_ai_usage_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_job_posts_active_posted", "job_posts", ["is_active", "posted_at"])
    op.create_index("ix_job_posts_active_remote_posted", "job_posts", ["is_active", "is_remote", "posted_at"])
    op.create_index("ix_job_posts_source_active", "job_posts", ["source", "is_active"])
    op.create_index("ix_job_applications_job_status", "job_applications", ["job_id", "status"])
    op.create_index("ix_job_applications_user_created", "job_applications", ["user_id", "created_at"])
    op.create_index("ix_notifications_user_read_created", "notifications", ["user_id", "is_read", "created_at"])
    op.create_index("ix_project_members_user_project", "project_members", ["user_id", "project_id"])
    op.create_index("ix_project_tasks_project_status", "project_tasks", ["project_id", "status"])
    op.create_index("ix_task_offers_candidate_status", "task_assignment_offers", ["candidate_user_id", "status"])
    op.create_index("ix_project_activity_project_created", "project_activity", ["project_id", "created_at"])


def downgrade() -> None:
    for name, table in (
        ("ix_project_activity_project_created", "project_activity"),
        ("ix_task_offers_candidate_status", "task_assignment_offers"),
        ("ix_project_tasks_project_status", "project_tasks"),
        ("ix_project_members_user_project", "project_members"),
        ("ix_notifications_user_read_created", "notifications"),
        ("ix_job_applications_user_created", "job_applications"),
        ("ix_job_applications_job_status", "job_applications"),
        ("ix_job_posts_source_active", "job_posts"),
        ("ix_job_posts_active_remote_posted", "job_posts"),
        ("ix_job_posts_active_posted", "job_posts"),
    ):
        op.drop_index(name, table_name=table)
