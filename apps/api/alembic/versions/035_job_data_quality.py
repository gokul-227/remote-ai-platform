"""Job data quality: explicit salary period, no invented type/level defaults.

Revision ID: 035_job_data_quality
Revises: 034_ai_usage_user

- Adds job_posts.salary_period (year|month|hour|project, nullable) so the UI
  stops guessing hourly vs annual from the amount.
- Aggregated jobs were stored with experience_level="mid" and (for most
  sources) job_type="full-time" as hardcoded defaults, not source data.
  Reset those to unknown. Direct posts keep what their authors chose.
- One spelling for job types (full_time -> full-time).
- RemoteOK salaries are annual.
"""

from alembic import op
import sqlalchemy as sa


revision = "035_job_data_quality"
down_revision = "034_ai_usage_user"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("job_posts", sa.Column("salary_period", sa.String(20), nullable=True))
    op.execute(
        "UPDATE job_posts SET experience_level = NULL "
        "WHERE upper(source) <> 'DIRECT' AND experience_level = 'mid'"
    )
    op.execute(
        "UPDATE job_posts SET job_type = 'unspecified' "
        "WHERE upper(source) IN ('ARBEITNOW', 'REMOTEOK', 'THEMUSE', 'USAJOBS') "
        "AND job_type = 'full-time'"
    )
    op.execute("UPDATE job_posts SET job_type = 'full-time' WHERE job_type IN ('full_time', 'fulltime')")
    op.execute("UPDATE job_posts SET job_type = 'part-time' WHERE job_type IN ('part_time', 'parttime')")
    op.execute(
        "UPDATE job_posts SET salary_period = 'year' "
        "WHERE upper(source) = 'REMOTEOK' AND (salary_min IS NOT NULL OR salary_max IS NOT NULL)"
    )


def downgrade() -> None:
    op.drop_column("job_posts", "salary_period")
