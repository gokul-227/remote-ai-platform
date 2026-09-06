"""Add stripe_webhook_events dedup table.

Revision ID: 032_stripe_webhook_events
Revises: 031_analytics_events

Guards the Stripe webhook receiver (apps/api/app/domains/payments/router.py)
against double-processing a replayed/duplicate event delivery. Previously
the handler only compared the *resulting* PaymentTransaction.status to the
new status -- safe against an exact re-delivery of the same event, but not
against an out-of-order replay of an older (still validly signed, within
Stripe's signature timestamp tolerance) event overwriting a later, more
advanced status -- e.g. replaying a captured payment_intent.canceled after
the escrow was already released, silently reverting it to REFUNDED.

event_id is the primary key, so inserting an already-seen event raises
IntegrityError and is treated as an already-processed no-op.
"""

from alembic import op
import sqlalchemy as sa


revision = "032_stripe_webhook_events"
down_revision = "031_analytics_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stripe_webhook_events",
        sa.Column("event_id", sa.String(length=255), primary_key=True),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("stripe_webhook_events")
