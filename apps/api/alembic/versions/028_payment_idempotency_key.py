"""Add a dedicated idempotency_key column to payment_transactions.

Revision ID: 028_payment_idempotency_key
Revises: 027_trust_verification_review

provider_reference previously had an idempotency key string-concatenated
onto it (e.g. "pi_xxx_mykey"), which corrupts the exact provider reference
needed for release()/refund() API calls against a real payment provider.
Production currently has zero payment_transactions rows (all test/demo
data was removed in this same pass), so no backfill is needed.
"""

from alembic import op
import sqlalchemy as sa


revision = "028_payment_idempotency_key"
down_revision = "027_trust_verification_review"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "payment_transactions",
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "ix_payment_transactions_idempotency_key",
        "payment_transactions",
        ["idempotency_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_payment_transactions_idempotency_key", table_name="payment_transactions")
    op.drop_column("payment_transactions", "idempotency_key")
