"""Billing follow-ups: open-to-opportunities becomes opt-in, employer branding,
referral credit retries.

Revision ID: 080_billing_followups
Revises: 079_slack_identities

- engineer_profiles.is_open_to_work: server default false, and every existing
  row is set to false. There is no record of who switched it on deliberately
  (it defaulted to true), so all members are asked again with a one-time
  banner on their profile. This is the only data change.
- company_profiles.cover_video_url and company_testimonials (employer branding).
- billing_referrals: per-side credit timestamps and retry bookkeeping.

No CONCURRENTLY; new columns are nullable or defaulted.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "080_billing_followups"
down_revision = "079_slack_identities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("engineer_profiles", "is_open_to_work", server_default=sa.text("false"))
    op.execute("UPDATE engineer_profiles SET is_open_to_work = false WHERE is_open_to_work")

    op.add_column("company_profiles", sa.Column("cover_video_url", sa.Text, nullable=True))
    op.create_table(
        "company_testimonials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("company_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("author_name", sa.String(120), nullable=False),
        sa.Column("author_title", sa.String(160), nullable=True),
        sa.Column("quote", sa.Text, nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_company_testimonials_company_id", "company_testimonials", ["company_id"])
    # DATA-03: every public table has row level security.
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE company_testimonials ENABLE ROW LEVEL SECURITY")

    for col in (
        sa.Column("qualified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("referrer_credited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("referred_credited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(200), nullable=True),
    ):
        op.add_column("billing_referrals", col)
    # Referrals already rewarded count as fully credited.
    op.execute(
        "UPDATE billing_referrals SET qualified_at = rewarded_at, referrer_credited_at = rewarded_at, "
        "referred_credited_at = rewarded_at WHERE rewarded_at IS NOT NULL"
    )


def downgrade() -> None:
    for col in ("last_error", "next_attempt_at", "attempts", "referred_credited_at", "referrer_credited_at", "qualified_at"):
        op.drop_column("billing_referrals", col)
    op.drop_table("company_testimonials")
    op.drop_column("company_profiles", "cover_video_url")
    # The opt-out of existing members is not reverted (no record of earlier values).
    op.alter_column("engineer_profiles", "is_open_to_work", server_default=sa.text("true"))
