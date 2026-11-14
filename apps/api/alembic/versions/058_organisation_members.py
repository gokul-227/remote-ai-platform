"""Organisation membership and roles (owner/admin/recruiter/member).

Additive. The company profile's user_id remains the implicit owner.

Revision ID: 058_organisation_members
Revises: 057_user_identities
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "058_organisation_members"
down_revision = "057_user_identities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organisation_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            UUID(as_uuid=True),
            sa.ForeignKey("company_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(16), nullable=False, server_default="member"),
        sa.Column("status", sa.String(16), nullable=False, server_default="invited"),
        sa.Column("invited_by_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("company_id", "user_id", name="uq_organisation_members_company_user"),
    )
    op.create_index("ix_organisation_members_company_id", "organisation_members", ["company_id"])
    op.create_index("ix_organisation_members_user_id", "organisation_members", ["user_id"])
    op.execute("ALTER TABLE organisation_members ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index("ix_organisation_members_user_id", table_name="organisation_members")
    op.drop_index("ix_organisation_members_company_id", table_name="organisation_members")
    op.drop_table("organisation_members")
