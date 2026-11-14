"""Store password hashes for local authentication."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "004_user_password_hash"
down_revision: str | None = "003_engineer_profile_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_hash")
