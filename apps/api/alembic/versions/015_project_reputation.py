"""Add project reputation reviews."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "015_project_reputation"
down_revision: Union[str, None] = "014_payment_abstraction"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "reviewer_id", "reviewee_id", name="uq_project_reviewer_reviewee"),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="ck_project_review_rating"),
    )
    op.create_index("ix_project_reviews_project_id", "project_reviews", ["project_id"])
    op.create_index("ix_project_reviews_reviewee_id", "project_reviews", ["reviewee_id"])


def downgrade() -> None:
    op.drop_index("ix_project_reviews_reviewee_id", table_name="project_reviews")
    op.drop_index("ix_project_reviews_project_id", table_name="project_reviews")
    op.drop_table("project_reviews")
