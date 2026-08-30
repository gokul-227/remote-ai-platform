"""Provider-neutral payment boundaries with an explicit no-real-money sandbox."""

from dataclasses import dataclass
from typing import Protocol
from uuid import uuid4

import stripe

from app.core.config import settings


@dataclass(frozen=True)
class PaymentProviderResult:
    reference: str
    status: str
    # Only meaningful for providers that require client-side confirmation
    # (Stripe's PaymentIntent flow) before funds are actually held.
    client_secret: str | None = None


class PaymentProvider(Protocol):
    async def authorize(self, amount: float, currency: str) -> PaymentProviderResult: ...
    async def release(self, reference: str) -> PaymentProviderResult: ...
    async def refund(self, reference: str) -> PaymentProviderResult: ...


class EscrowProvider(Protocol):
    async def hold(self, reference: str, amount: float, currency: str) -> PaymentProviderResult: ...
    async def release(self, reference: str) -> PaymentProviderResult: ...


class PayoutProvider(Protocol):
    async def payout(
        self, reference: str, amount: float, currency: str
    ) -> PaymentProviderResult: ...


class SandboxPaymentProvider:
    """Deterministic adapter for development and tests; it never contacts a payment network."""

    async def authorize(self, amount: float, currency: str) -> PaymentProviderResult:
        return PaymentProviderResult(reference=f"sandbox_auth_{uuid4().hex}", status="AUTHORIZED")

    async def hold(self, reference: str, amount: float, currency: str) -> PaymentProviderResult:
        return PaymentProviderResult(reference=reference, status="ESCROWED")

    async def release(self, reference: str) -> PaymentProviderResult:
        return PaymentProviderResult(reference=reference, status="RELEASED")

    async def refund(self, reference: str) -> PaymentProviderResult:
        return PaymentProviderResult(reference=reference, status="REFUNDED")

    async def payout(self, reference: str, amount: float, currency: str) -> PaymentProviderResult:
        return PaymentProviderResult(reference=reference, status="PAID_OUT")


# Stripe's PaymentIntent.status values, mapped to this app's status vocabulary.
_STRIPE_STATUS_MAP = {
    "requires_payment_method": "AUTHORIZED",  # created, awaiting client-side confirmation
    "requires_confirmation": "AUTHORIZED",
    "requires_action": "AUTHORIZED",  # e.g. 3DS pending
    "processing": "AUTHORIZED",
    "requires_capture": "ESCROWED",  # funds held, not yet captured
    "succeeded": "RELEASED",  # captured -> funds moved
    "canceled": "REFUNDED",
}


class StripePaymentProvider:
    """Real Stripe adapter using manual-capture PaymentIntents as the escrow primitive.

    Flow: authorize() creates a PaymentIntent with capture_method="manual" and
    returns its client_secret for the frontend to confirm with Stripe.js/
    Elements (this app never touches raw card data). Once the customer
    confirms, the PaymentIntent moves to requires_capture -- that is "held"
    (ESCROWED). release() captures it (moves funds). refund() cancels it if
    not yet captured, or issues a real Refund if it was.

    Never activated by default: requires PAYMENT_PROVIDER=stripe *and* a
    configured STRIPE_SECRET_KEY. Whether that key is test (sk_test_...) or
    live (sk_live_...) is a Stripe-dashboard-level choice this app doesn't
    make on its own.
    """

    def __init__(self) -> None:
        if not settings.STRIPE_SECRET_KEY:
            raise RuntimeError(
                "PAYMENT_PROVIDER=stripe requires STRIPE_SECRET_KEY to be set"
            )
        stripe.api_key = settings.STRIPE_SECRET_KEY

    async def authorize(self, amount: float, currency: str) -> PaymentProviderResult:
        intent = stripe.PaymentIntent.create(
            amount=round(amount * 100),
            currency=currency.lower(),
            capture_method="manual",
            automatic_payment_methods={"enabled": True},
        )
        return PaymentProviderResult(
            reference=intent.id,
            status=_STRIPE_STATUS_MAP.get(intent.status, "AUTHORIZED"),
            client_secret=intent.client_secret,
        )

    async def hold(self, reference: str, amount: float, currency: str) -> PaymentProviderResult:
        # The hold happens client-side when the customer confirms the
        # PaymentIntent created by authorize(); this just reflects current
        # server-side state rather than performing a separate API call.
        intent = stripe.PaymentIntent.retrieve(reference)
        return PaymentProviderResult(
            reference=reference, status=_STRIPE_STATUS_MAP.get(intent.status, "AUTHORIZED")
        )

    async def release(self, reference: str) -> PaymentProviderResult:
        intent = stripe.PaymentIntent.capture(reference)
        return PaymentProviderResult(
            reference=reference, status=_STRIPE_STATUS_MAP.get(intent.status, "RELEASED")
        )

    async def refund(self, reference: str) -> PaymentProviderResult:
        intent = stripe.PaymentIntent.retrieve(reference)
        if intent.status in ("succeeded",):
            stripe.Refund.create(payment_intent=reference)
        else:
            stripe.PaymentIntent.cancel(reference)
        return PaymentProviderResult(reference=reference, status="REFUNDED")

    async def payout(self, reference: str, amount: float, currency: str) -> PaymentProviderResult:
        # Paying out to a specific engineer requires that engineer to have
        # completed Stripe Connect onboarding (their own connected account
        # id) -- a real prerequisite this app does not yet collect, so this
        # is deliberately not implemented rather than faked.
        raise NotImplementedError(
            "Stripe payouts require a connected account per recipient (Stripe Connect), "
            "which is not yet implemented"
        )


def get_payment_provider() -> SandboxPaymentProvider | StripePaymentProvider:
    """Return the configured payment provider. Defaults to sandbox."""
    if settings.PAYMENT_PROVIDER == "stripe":
        return StripePaymentProvider()
    return SandboxPaymentProvider()
