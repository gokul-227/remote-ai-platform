"""The only module that calls Stripe for billing. Tests patch `stripe` here.

Key safety: a live key (sk_live_/rk_live_) is refused unless APP_ENV is
"production" AND BILLING_ENABLED is on; a test key is always allowed for
local manual testing; anything else is refused.
"""

from typing import Any

import stripe
from fastapi import HTTPException, status

from app.core.config import settings

BILLING_DISABLED_DETAIL = "Paid features are not available yet. Nothing has been charged."


class BillingConfigError(RuntimeError):
    """Stripe is not configured, or the configured key may not be used here."""


def billing_enabled() -> bool:
    return bool(settings.BILLING_ENABLED)


def require_billing_enabled() -> None:
    """FastAPI dependency: checkout and portal do not exist while billing is off."""
    if not billing_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=BILLING_DISABLED_DETAIL)


def api_key() -> str:
    key = settings.STRIPE_SECRET_KEY or ""
    if not key:
        raise BillingConfigError("STRIPE_SECRET_KEY is not set")
    if key.startswith(("sk_live_", "rk_live_")):
        if settings.APP_ENV != "production" or not settings.BILLING_ENABLED:
            raise BillingConfigError(
                "Refusing a live Stripe key: requires APP_ENV=production and BILLING_ENABLED"
            )
        return key
    if key.startswith(("sk_test_", "rk_test_")):
        return key
    raise BillingConfigError("STRIPE_SECRET_KEY is not a recognised Stripe secret key")


def configured() -> bool:
    try:
        api_key()
    except BillingConfigError:
        return False
    return True


def create_customer(*, email: str, name: str | None, user_id: str) -> str:
    customer = stripe.Customer.create(
        api_key=api_key(), email=email, name=name or email, metadata={"user_id": user_id}
    )
    return str(customer["id"])


def create_checkout_session(params: dict[str, Any]) -> dict[str, Any]:
    session = stripe.checkout.Session.create(api_key=api_key(), **params)
    return {"id": session["id"], "url": session["url"]}


def create_portal_session(*, customer: str, return_url: str) -> str:
    portal = stripe.billing_portal.Session.create(
        api_key=api_key(), customer=customer, return_url=return_url
    )
    return str(portal["url"])


def cancel_at_period_end(subscription_id: str) -> None:
    stripe.Subscription.modify(subscription_id, api_key=api_key(), cancel_at_period_end=True)


def refund(*, payment_intent: str, amount: int | None = None) -> dict[str, Any]:
    params: dict[str, Any] = {"payment_intent": payment_intent}
    if amount is not None:
        params["amount"] = amount
    result = stripe.Refund.create(api_key=api_key(), **params)
    return {"id": result["id"], "status": result["status"], "amount": result["amount"]}


def credit_customer_balance(*, customer: str, amount_cents: int, description: str) -> None:
    """Negative balance transaction = credit applied to the next invoices."""
    stripe.Customer.create_balance_transaction(
        customer, api_key=api_key(), amount=-abs(amount_cents), currency="eur", description=description
    )


def create_product_and_price(
    *, name: str, description: str | None, slug: str, unit_amount: int, currency: str, interval: str | None
) -> tuple[str, str]:
    key = api_key()
    product = stripe.Product.create(
        api_key=key, name=name, description=description or name, metadata={"slug": slug}
    )
    price_params: dict[str, Any] = {
        "product": product["id"],
        "unit_amount": unit_amount,
        "currency": currency,
        "tax_behavior": "inclusive",
        "metadata": {"slug": slug},
    }
    if interval:
        price_params["recurring"] = {"interval": interval}
    price = stripe.Price.create(api_key=key, **price_params)
    return str(product["id"]), str(price["id"])


def create_price(
    *, product: str, slug: str, unit_amount: int, currency: str, interval: str | None
) -> str:
    params: dict[str, Any] = {
        "product": product,
        "unit_amount": unit_amount,
        "currency": currency,
        "tax_behavior": "inclusive",
        "metadata": {"slug": slug},
    }
    if interval:
        params["recurring"] = {"interval": interval}
    return str(stripe.Price.create(api_key=api_key(), **params)["id"])


def construct_event(payload: bytes, signature: str) -> Any:
    secret = settings.STRIPE_WEBHOOK_SECRET
    if not secret:
        raise BillingConfigError("STRIPE_WEBHOOK_SECRET is not set")
    return stripe.Webhook.construct_event(payload, signature, secret)
