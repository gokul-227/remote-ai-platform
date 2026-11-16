"""
Billing & Entitlements domain: paid features sold through Stripe Checkout.

The catalogue (`catalog.py`, seeded into `plans`), purchases, invoices,
subscriptions and the `entitlements` table that features check through
`grants.py`. Everything chargeable is gated by BILLING_ENABLED; see
docs/operations/billing.md. `entitlements.py` keeps the older plan-level
`require_entitlement` dependency.
"""
