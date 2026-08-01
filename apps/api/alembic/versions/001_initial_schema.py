"""Initial schema for WorkMesh AI MVP v1

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-07-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. UserRole enum
    user_role_enum = postgresql.ENUM('ENGINEER', 'COMPANY', 'ADMIN', name='user_role_enum')
    user_role_enum.create(op.get_bind(), checkfirst=True)

    # 2. users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('keycloak_id', sa.String(255), unique=True, nullable=True, index=True),
        sa.Column('email', sa.String(255), unique=True, nullable=False, index=True),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('role', sa.Enum('ENGINEER', 'COMPANY', 'ADMIN', name='user_role_enum'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('avatar_url', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 3. engineer_profiles table
    op.create_table(
        'engineer_profiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), unique=True, nullable=False, index=True),
        sa.Column('headline', sa.String(255), nullable=True),
        sa.Column('bio', sa.Text(), nullable=True),
        sa.Column('location', sa.String(255), nullable=True),
        sa.Column('years_of_experience', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('primary_role', sa.String(255), nullable=True),
        sa.Column('github_url', sa.Text(), nullable=True),
        sa.Column('linkedin_url', sa.Text(), nullable=True),
        sa.Column('portfolio_url', sa.Text(), nullable=True),
        sa.Column('skills', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('experience', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('projects', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('education', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('resume_url', sa.Text(), nullable=True),
        sa.Column('parsed_resume_data', postgresql.JSONB(), nullable=True),
        sa.Column('ai_summary', sa.Text(), nullable=True),
        sa.Column('matching_keywords', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_open_to_work', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 4. company_profiles table
    op.create_table(
        'company_profiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), unique=True, nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('website', sa.Text(), nullable=True),
        sa.Column('logo_url', sa.Text(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('industry', sa.String(255), nullable=True),
        sa.Column('company_size', sa.String(50), nullable=True),
        sa.Column('location', sa.String(255), nullable=True),
        sa.Column('tech_stack', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 5. job_posts table
    op.create_table(
        'job_posts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('company_profiles.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('title', sa.String(255), nullable=False, index=True),
        sa.Column('slug', sa.String(255), nullable=False, index=True),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('company_name', sa.String(255), nullable=False, index=True),
        sa.Column('company_logo', sa.Text(), nullable=True),
        sa.Column('location', sa.String(255), nullable=True),
        sa.Column('is_remote', sa.Boolean(), nullable=False, server_default='true', index=True),
        sa.Column('job_type', sa.String(50), nullable=False, server_default='full-time'),
        sa.Column('experience_level', sa.String(50), nullable=True),
        sa.Column('salary_min', sa.Float(), nullable=True),
        sa.Column('salary_max', sa.Float(), nullable=True),
        sa.Column('currency', sa.String(10), nullable=False, server_default='USD'),
        sa.Column('skills', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('external_id', sa.String(255), nullable=True, unique=True, index=True),
        sa.Column('external_url', sa.Text(), nullable=True),
        sa.Column('source', sa.String(50), nullable=False, server_default='DIRECT', index=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true', index=True),
        sa.Column('posted_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 6. job_matches table
    op.create_table(
        'job_matches',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('engineer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('engineer_profiles.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('job_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('job_posts.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('overall_score', sa.Float(), nullable=False, index=True),
        sa.Column('skill_score', sa.Float(), nullable=False),
        sa.Column('experience_score', sa.Float(), nullable=False),
        sa.Column('role_score', sa.Float(), nullable=False),
        sa.Column('reasoning', sa.Text(), nullable=False),
        sa.Column('matching_skills', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('missing_skills', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('status', sa.String(50), nullable=False, server_default='recommended', index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('engineer_id', 'job_id', name='uq_engineer_job_match'),
    )


def downgrade() -> None:
    op.drop_table('job_matches')
    op.drop_table('job_posts')
    op.drop_table('company_profiles')
    op.drop_table('engineer_profiles')
    op.drop_table('users')
    op.execute("DROP TYPE IF EXISTS user_role_enum")
