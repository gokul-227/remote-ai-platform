"""Add user_verifications and user_trust_scores tables.

Revision ID: 021_trust_reputation
Revises: 020_contracts
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "021_trust_reputation"
down_revision = "020_contracts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # User Verifications table
    op.create_table(
        "user_verifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("verification_type", sa.String(50), nullable=False),  # IDENTITY, GITHUB, LINKEDIN, SKILL_ASSESSMENT
        sa.Column("status", sa.String(30), nullable=False, server_default="PENDING"),  # PENDING, VERIFIED, REJECTED
        sa.Column("verifier_notes", sa.Text(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_user_verifications_user_id", "user_verifications", ["user_id"])
    op.create_index("ix_user_verifications_verification_type", "user_verifications", ["verification_type"])

    # User Trust Scores cache table
    op.create_table(
        "user_trust_scores",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("overall_score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("completion_rate", sa.Float(), nullable=False, server_default="100.0"),
        sa.Column("on_time_rate", sa.Float(), nullable=False, server_default="100.0"),
        sa.Column("rating_avg", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("review_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("verified_skills_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("score_breakdown", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("user_trust_scores")
    op.drop_table("user_verifications")
