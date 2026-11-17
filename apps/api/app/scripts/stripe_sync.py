"""Create or update Stripe Products and Prices from the `plans` table, and
register the webhook endpoint. Idempotent; prints only Stripe object ids.

    python -m app.scripts.stripe_sync [--dry-run] [--webhook-url URL] [--no-webhook]

- Product id is `rap_<slug>` (created once, name/description kept in step).
- Price lookup key is `rap_<slug>`. An active price with that key and the same
  amount, currency and interval is reused; otherwise a new tax-inclusive price
  is created and the lookup key moves to it (old subscribers keep theirs).
- Inactive plans (e.g. the verified badge) are skipped.
- The webhook endpoint for --webhook-url is created or its events updated.
  Stripe shows a new endpoint's signing secret only in the dashboard: copy it
  into Infisical as STRIPE_WEBHOOK_SECRET. This script never prints secrets.

Live keys are refused unless APP_ENV=production and BILLING_ENABLED=true
(app/services/billing/stripe_gateway.py).
"""

import argparse
import asyncio
from typing import Any, cast

import stripe
from sqlalchemy import select

from app.core import database
from app.domains.billing.models import Plan
from app.services.billing import stripe_gateway as gateway

DEFAULT_WEBHOOK_URL = "https://api.remoteaiplatform.com/api/v1/payments/webhooks/stripe"
WEBHOOK_EVENTS = [
    "checkout.session.completed",
    "checkout.session.expired",
    "invoice.paid",
    "invoice.payment_failed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "charge.refunded",
    # Marketplace escrow (only acted on while PAYMENT_PROVIDER=stripe).
    "payment_intent.amount_capturable_updated",
    "payment_intent.succeeded",
    "payment_intent.canceled",
    "payment_intent.payment_failed",
]


def _interval(plan: Plan) -> str | None:
    return None if plan.mode == "payment" else plan.billing_interval


def sync_product(plan: Plan, key: str, dry_run: bool) -> str:
    pid = f"rap_{plan.slug}"
    try:
        stripe.Product.retrieve(pid, api_key=key)
        if not dry_run:
            stripe.Product.modify(pid, api_key=key, name=plan.name, description=plan.description or "", active=True)
        action = "updated"
    except stripe.InvalidRequestError:
        if not dry_run:
            stripe.Product.create(
                api_key=key, id=pid, name=plan.name, description=plan.description or plan.name,
                metadata={"slug": plan.slug}, tax_code="txcd_10000000",
            )
        action = "created"
    print(f"product {pid} {action}")
    return pid


def sync_price(plan: Plan, product: str, key: str, dry_run: bool) -> str | None:
    lookup = f"rap_{plan.slug}"
    interval = _interval(plan)
    existing = stripe.Price.list(api_key=key, lookup_keys=[lookup], active=True, limit=1)
    for price in existing.get("data", []):
        recurring = (price.get("recurring") or {}).get("interval")
        if price["unit_amount"] == plan.price_cents and price["currency"] == plan.currency and recurring == interval:
            print(f"price {price['id']} reused ({lookup})")
            return str(price["id"])
    if dry_run:
        print(f"price for {lookup} would be created ({plan.price_cents} {plan.currency} {interval or 'one-off'})")
        return None
    params: dict[str, Any] = {
        "product": product,
        "unit_amount": plan.price_cents,
        "currency": plan.currency,
        "tax_behavior": "inclusive",
        "lookup_key": lookup,
        "transfer_lookup_key": True,
        "metadata": {"slug": plan.slug},
    }
    if interval:
        params["recurring"] = {"interval": interval}
    price = stripe.Price.create(api_key=key, **params)
    print(f"price {price['id']} created ({lookup})")
    return str(price["id"])


def sync_webhook(url: str, key: str, dry_run: bool) -> None:
    endpoints = stripe.WebhookEndpoint.list(api_key=key, limit=100)
    for ep in endpoints.get("data", []):
        if ep.get("url") == url:
            if not dry_run:
                stripe.WebhookEndpoint.modify(ep["id"], api_key=key, enabled_events=cast(Any, WEBHOOK_EVENTS), disabled=False)
            print(f"webhook {ep['id']} updated")
            return
    if dry_run:
        print(f"webhook for {url} would be created")
        return
    ep = stripe.WebhookEndpoint.create(
        api_key=key, url=url, enabled_events=cast(Any, WEBHOOK_EVENTS), description="Remote AI Platform API"
    )
    # The response carries the signing secret: deliberately not printed.
    print(f"webhook {ep['id']} created; copy its signing secret from the Stripe dashboard "
          "into Infisical as STRIPE_WEBHOOK_SECRET")


async def run(dry_run: bool, webhook_url: str | None) -> int:
    key = gateway.api_key()
    async with database.AsyncSessionFactory() as db:
        plans = (await db.scalars(select(Plan).where(Plan.mode != "free").order_by(Plan.sort_order))).all()
        for plan in plans:
            if not plan.is_active:
                print(f"skip {plan.slug} (inactive)")
                continue
            product = sync_product(plan, key, dry_run)
            price = sync_price(plan, product, key, dry_run)
            if not dry_run:
                plan.stripe_product_id = product
                plan.stripe_price_id = price
        if not dry_run:
            await db.commit()
    if webhook_url:
        sync_webhook(webhook_url, key, dry_run)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--webhook-url", default=DEFAULT_WEBHOOK_URL)
    parser.add_argument("--no-webhook", action="store_true")
    args = parser.parse_args(argv)
    try:
        return asyncio.run(run(args.dry_run, None if args.no_webhook else args.webhook_url))
    except gateway.BillingConfigError as exc:
        print(f"refused: {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
