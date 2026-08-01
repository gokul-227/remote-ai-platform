"""Add marketplace foundation fields and normalized entities.

Revision ID: 007_marketplace_foundation
Revises: 006_projects_notifications
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "007_marketplace_foundation"
down_revision = "006_projects_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("engineer_profiles", sa.Column("profile_image_url", sa.Text(), nullable=True))
    op.add_column("engineer_profiles", sa.Column("certifications", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.add_column("engineer_profiles", sa.Column("previous_companies", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.add_column("engineer_profiles", sa.Column("employment_type", sa.String(50), nullable=True))
    op.add_column("engineer_profiles", sa.Column("available_hours", sa.Integer(), nullable=True))
    op.add_column("engineer_profiles", sa.Column("profile_score", sa.Float(), nullable=True))
    op.add_column("engineer_profiles", sa.Column("missing_skills", postgresql.JSONB(), nullable=False, server_default="[]"))

    op.add_column("company_profiles", sa.Column("country", sa.String(100), nullable=True))
    op.add_column("company_profiles", sa.Column("hiring_status", sa.String(50), nullable=True, server_default="actively_hiring"))

    op.add_column("job_posts", sa.Column("budget_min", sa.Float(), nullable=True))
    op.add_column("job_posts", sa.Column("budget_max", sa.Float(), nullable=True))
    op.add_column("job_posts", sa.Column("timeline", sa.String(100), nullable=True))
    op.add_column("job_posts", sa.Column("remote_preference", sa.String(100), nullable=True))
    op.add_column("job_posts", sa.Column("ai_analysis", postgresql.JSONB(), nullable=True))
    op.add_column("job_matches", sa.Column("timezone_score", sa.Float(), nullable=False, server_default="0"))
    op.add_column("job_matches", sa.Column("availability_score", sa.Float(), nullable=False, server_default="0"))
    op.add_column("job_matches", sa.Column("compensation_score", sa.Float(), nullable=False, server_default="0"))
    op.add_column("job_matches", sa.Column("remote_score", sa.Float(), nullable=False, server_default="0"))

    op.create_table(
        "skills",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
    )
    op.create_table(
        "user_skills",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("skill_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("proficiency", sa.String(30), nullable=True),
    )
    op.create_table(
        "job_skills",
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("job_posts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("skill_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("required_level", sa.String(30), nullable=True),
    )
    op.create_table(
        "project_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("milestone", sa.String(255), nullable=True),
        sa.Column("required_skills", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(30), nullable=False, server_default="todo"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("job_posts.id", ondelete="CASCADE"), nullable=True),
        sa.Column("engineer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("engineer_profiles.id", ondelete="CASCADE"), nullable=True),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("explanation", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "ai_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("job_posts.id", ondelete="CASCADE"), nullable=True),
        sa.Column("report_type", sa.String(50), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    for table in ("ai_reports", "recommendations", "project_tasks", "job_skills", "user_skills", "skills"):
        op.drop_table(table)
    for table, columns in {
        "job_posts": ("ai_analysis", "remote_preference", "timeline", "budget_max", "budget_min"),
        "company_profiles": ("hiring_status", "country"),
        "engineer_profiles": ("missing_skills", "profile_score", "available_hours", "employment_type", "previous_companies", "certifications", "profile_image_url"),
        "job_matches": ("remote_score", "compensation_score", "availability_score", "timezone_score"),
    }.items():
        for column in columns:
            op.drop_column(table, column)
