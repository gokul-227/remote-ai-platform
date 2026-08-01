"""Store password hashes for local authentication."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "004_user_password_hash"
down_revision: Union[str, None] = "003_engineer_profile_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_hash")
