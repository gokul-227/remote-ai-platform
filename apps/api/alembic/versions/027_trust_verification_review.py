"""Add reviewed_by_id to user_verifications for real admin-reviewed verification.

Revision ID: 027_trust_verification_review
Revises: 026_performance_and_soft_deletes
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "027_trust_verification_review"
down_revision = "026_performance_and_soft_deletes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_verifications",
        sa.Column(
            "reviewed_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    # Existing auto-"VERIFIED" rows predate real review — reclassify them as
    # self-reported so they no longer imply an admin confirmed the evidence.
    op.execute(
        "UPDATE user_verifications SET status = 'SELF_REPORTED' "
        "WHERE status = 'VERIFIED' AND reviewed_by_id IS NULL"
    )


def downgrade() -> None:
    op.drop_column("user_verifications", "reviewed_by_id")
