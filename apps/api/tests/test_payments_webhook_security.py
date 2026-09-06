"""Security regression tests for the Stripe webhook receiver.

Covers:
1. An invalid/unsigned event is rejected (no DB write, no status change).
2. A duplicate delivery of the same event (Stripe's own retries, or a
   captured-and-replayed request) is a safe no-op -- it must not double-fire
   the "escrow funded" notification.
3. An out-of-order replay of an older event must never move a payment that
   already reached a terminal state (RELEASED/REFUNDED/FAILED) backward.
"""

import uuid

import pytest
import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.notifications.models import Notification
from app.domains.payments.models import StripeWebhookEvent
from app.domains.projects.models import PaymentTransaction, Project
from httpx import AsyncClient


@pytest.fixture(autouse=True)
def _stripe_provider_enabled(monkeypatch):
    """Turn on the Stripe code path (signature check + webhook handler) for
    this test module only; other tests keep the default sandbox provider."""
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER", "stripe")
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", "whsec_test_secret")
    yield


async def _make_escrowed_payment(
    db: AsyncSession, test_user: User, provider_reference: str, status_: str = "ESCROWED"
) -> PaymentTransaction:
    test_user.role = UserRole.COMPANY
    await db.commit()

    company = CompanyProfile(user_id=test_user.id, name="Webhook Test Corp")
    db.add(company)
    await db.flush()

    project = Project(
        company_id=company.id, title="Webhook Project", description="Desc", status="ACTIVE"
    )
    db.add(project)
    await db.flush()

    payee = User(
        id=uuid.uuid4(),
        keycloak_id=str(uuid.uuid4()),
        email=f"payee_{uuid.uuid4().hex[:8]}@example.com",
        full_name="Payee",
        password_hash="x",
        role=UserRole.ENGINEER,
        is_active=True,
        token_version=1,
    )
    db.add(payee)
    await db.flush()

    payment = PaymentTransaction(
        project_id=project.id,
        payer_id=test_user.id,
        payee_id=payee.id,
        amount=100.0,
        currency="USD",
        status=status_,
        provider="STRIPE",
        provider_reference=provider_reference,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    return payment


def _stripe_event(event_id: str, event_type: str, intent_id: str) -> stripe.Event:
    return stripe.Event.construct_from(
        {
            "id": event_id,
            "type": event_type,
            "data": {"object": {"id": intent_id}},
        },
        key="sk_test",
    )


@pytest.mark.asyncio
async def test_webhook_rejects_invalid_signature(client: AsyncClient, monkeypatch):
    def _raise(*args, **kwargs):
        raise stripe.SignatureVerificationError("bad signature", "sig")

    monkeypatch.setattr(stripe.Webhook, "construct_event", _raise)

    res = await client.post(
        "/api/v1/payments/webhooks/stripe",
        content=b'{"fake": true}',
        headers={"stripe-signature": "invalid"},
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_webhook_replay_of_same_event_does_not_double_notify(
    client: AsyncClient, test_user: User, db: AsyncSession, monkeypatch
):
    payment = await _make_escrowed_payment(
        db, test_user, provider_reference="pi_replay_test", status_="AUTHORIZED"
    )
    event = _stripe_event("evt_replay_1", "payment_intent.amount_capturable_updated", "pi_replay_test")
    monkeypatch.setattr(stripe.Webhook, "construct_event", lambda *a, **k: event)

    # Deliver the exact same event twice, as Stripe's own retry logic (or a
    # captured-and-replayed request) would.
    res1 = await client.post(
        "/api/v1/payments/webhooks/stripe",
        content=b"{}",
        headers={"stripe-signature": "sig"},
    )
    res2 = await client.post(
        "/api/v1/payments/webhooks/stripe",
        content=b"{}",
        headers={"stripe-signature": "sig"},
    )
    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res2.json().get("duplicate") is True

    # The webhook handler commits through a *different* session
    # (app.dependency_overrides' override_get_db) than this test's own `db`
    # fixture, so `payment` must be explicitly refreshed rather than
    # re-.get()'d -- otherwise SQLAlchemy's identity map would silently
    # return this session's stale, already-loaded copy instead of
    # re-querying, making the assertion below pass regardless of what the
    # webhook actually did.
    await db.refresh(payment)
    assert payment.status == "ESCROWED"

    # Dedup ledger has exactly one row for this event id.
    dedup_rows = (
        await db.execute(
            select(StripeWebhookEvent).where(StripeWebhookEvent.event_id == "evt_replay_1")
        )
    ).scalars().all()
    assert len(dedup_rows) == 1

    # The "Escrow Funded" notification fired exactly once, not twice.
    notifications = (
        await db.execute(
            select(Notification).where(
                Notification.user_id == payment.payee_id,
                Notification.kind == "escrow_funded",
            )
        )
    ).scalars().all()
    assert len(notifications) == 1


@pytest.mark.asyncio
async def test_webhook_out_of_order_replay_does_not_regress_terminal_status(
    client: AsyncClient, test_user: User, db: AsyncSession, monkeypatch
):
    """A payment that already reached RELEASED must never be pushed back to
    REFUNDED by an older, out-of-order (but validly signed) webhook event --
    e.g. one captured and replayed after the real release already happened."""
    payment = await _make_escrowed_payment(
        db, test_user, provider_reference="pi_terminal_test", status_="RELEASED"
    )
    # A *different* event id than whatever originally released it -- this
    # models an old payment_intent.canceled arriving late/out of order, not
    # a literal re-delivery of the same event.
    stale_event = _stripe_event("evt_stale_cancel", "payment_intent.canceled", "pi_terminal_test")
    monkeypatch.setattr(stripe.Webhook, "construct_event", lambda *a, **k: stale_event)

    res = await client.post(
        "/api/v1/payments/webhooks/stripe",
        content=b"{}",
        headers={"stripe-signature": "sig"},
    )
    assert res.status_code == 200

    await db.refresh(payment)
    assert payment.status == "RELEASED", (
        "an out-of-order webhook replay must not revert a terminal payment status"
    )
