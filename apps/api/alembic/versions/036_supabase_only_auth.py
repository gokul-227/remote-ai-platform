"""Supabase is the only identity provider: drop the legacy password/Keycloak auth schema.

Revision ID: 036_supabase_only_auth
Revises: 035_job_data_quality

- users.keycloak_id -> users.auth_subject (it has held the Supabase Auth
  subject since the switch to Supabase; the old name was misleading).
- Drops users.password_hash, users.token_version and the
  password_reset_tokens table: sign-in, passwords and recovery are handled
  entirely by Supabase Auth, and session revocation uses
  users.sessions_revoked_at (033).

Accounts that only ever had a legacy password keep their row, profile and
data; they sign in with an email code, and the first Supabase sign-in links
the row by verified email.
"""

from alembic import op
import sqlalchemy as sa


revision = "036_supabase_only_auth"
down_revision = "035_job_data_quality"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "keycloak_id", new_column_name="auth_subject")
    op.execute("ALTER INDEX IF EXISTS ix_users_keycloak_id RENAME TO ix_users_auth_subject")
    op.drop_column("users", "password_hash")
    op.drop_column("users", "token_version")
    op.drop_table("password_reset_tokens")


def downgrade() -> None:
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))
    op.execute("ALTER INDEX IF EXISTS ix_users_auth_subject RENAME TO ix_users_keycloak_id")
    op.alter_column("users", "auth_subject", new_column_name="keycloak_id")
