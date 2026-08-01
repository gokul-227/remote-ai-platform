"""Add fields present on the current engineer profile model."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "003_engineer_profile_fields"
down_revision: Union[str, None] = "002_admin_and_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("engineer_profiles", sa.Column("country", sa.String(100), nullable=True))
    op.add_column("engineer_profiles", sa.Column("timezone", sa.String(50), nullable=True))
    op.add_column(
        "engineer_profiles",
        sa.Column("languages", postgresql.JSONB(), nullable=False, server_default="[]"),
    )
    op.add_column("engineer_profiles", sa.Column("hourly_rate", sa.Float(), nullable=True))
    op.add_column("engineer_profiles", sa.Column("desired_salary_min", sa.Float(), nullable=True))
    op.add_column(
        "engineer_profiles",
        sa.Column("availability", sa.String(50), nullable=True, server_default="Immediate"),
    )
    op.add_column(
        "engineer_profiles",
        sa.Column("remote_preference", sa.String(50), nullable=True, server_default="100% Remote"),
    )


def downgrade() -> None:
    for column in (
        "remote_preference",
        "availability",
        "desired_salary_min",
        "hourly_rate",
        "languages",
        "timezone",
        "country",
    ):
        op.drop_column("engineer_profiles", column)
