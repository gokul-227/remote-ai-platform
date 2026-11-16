"""Paid features on Stripe (Phase 1). Stripe is always mocked; no network calls.

Covers the BILLING_ENABLED gate, the live-key guard, Checkout parameters (tax,
tax ids, promotion codes, trial once), the Stripe Tax fallback, the signed and
idempotent webhook (grants, subscriptions, invoices, dunning, refunds), the
entitlement helper used by features (featured/urgent labels, sponsored
clicks, credits, AI allowance), account deletion, the data export and the
staff console.
"""

import hashlib
import hmac
import json
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import stripe
from auth_support import token_for
from conftest import TestingSessionLocal
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.domains.auth.models import User, UserRole
from app.domains.billing import grants, placements, service
from app.domains.billing.catalog import CATALOG
from app.domains.billing.models import (
    AdClick,
    BillingCustomer,
    Entitlement,
    Invoice,
    MessageCreditSpend,
    Plan,
    Purchase,
    Referral,
    SponsoredCampaign,
    Subscription,
)
from app.services.billing import stripe_gateway as gateway

WHSEC = "whsec_test_secret"
SESSIONS: list[str] = []


class FakeStripe:
    """Records every Stripe call; returns plausible objects."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.fail_tax_once = False

    def install(self, monkeypatch: pytest.MonkeyPatch) -> "FakeStripe":
        def rec(name: str, result: Any):
            def fn(*args: Any, **kwargs: Any) -> Any:
                kwargs.pop("api_key", None)
                self.calls.append((name, {"args": args, **kwargs}))
                return result(*args, **kwargs) if callable(result) else result
            return fn

        def session(**kwargs: Any) -> dict:
            if self.fail_tax_once and "automatic_tax" in kwargs:
                self.fail_tax_once = False
                raise stripe.InvalidRequestError("Stripe Tax has not been activated on your account", "automatic_tax")
            sid = f"cs_test_{uuid.uuid4().hex[:8]}"
            SESSIONS.append(sid)
            return {"id": sid, "url": "https://checkout.stripe.com/c/pay/test"}

        monkeypatch.setattr(stripe.Customer, "create", rec("customer", lambda **k: {"id": f"cus_test_{uuid.uuid4().hex[:8]}"}))
        monkeypatch.setattr(stripe.Customer, "create_balance_transaction", rec("balance", {"id": "cbtxn_1"}))
        monkeypatch.setattr(stripe.checkout.Session, "create", rec("checkout", session))
        monkeypatch.setattr(stripe.billing_portal.Session, "create", rec("portal", {"url": "https://billing.stripe.com/p/test"}))
        monkeypatch.setattr(stripe.Subscription, "modify", rec("sub_modify", {"id": "sub"}))
        monkeypatch.setattr(stripe.Refund, "create", rec("refund", {"id": "re_1", "status": "succeeded", "amount": 4900}))
        monkeypatch.setattr(stripe.Price, "create", rec("price", lambda **k: {"id": f"price_{uuid.uuid4().hex[:6]}"}))
        monkeypatch.setattr(stripe.Product, "create", rec("product", lambda **k: {"id": k.get("id", "prod_x")}))
        return self

    def named(self, name: str) -> list[dict[str, Any]]:
        return [c for n, c in self.calls if n == name]


@pytest.fixture
def fake_stripe(monkeypatch: pytest.MonkeyPatch) -> FakeStripe:
    return FakeStripe().install(monkeypatch)


@pytest.fixture
def billing_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "BILLING_ENABLED", True)
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_123")
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", WHSEC)
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://example.test")


async def seed_catalog() -> dict[str, Plan]:
    async with TestingSessionLocal() as db:
        for item in CATALOG:
            db.add(
                Plan(
                    name=item["name"], slug=item["slug"], price_cents=item["price_cents"],
                    billing_interval=item["billing_interval"], entitlements=item["grants"],
                    is_active=item.get("enabled", True), description=item["description"],
                    audience=item["audience"], mode=item["mode"], duration_days=item["duration_days"],
                    target=item["target"], trial_days=item.get("trial_days"), sort_order=item["sort_order"],
                    stripe_price_id=f"price_{item['slug']}", stripe_product_id=f"rap_{item['slug']}",
                )
            )
        await db.commit()
        return {p.slug: p for p in (await db.scalars(select(Plan))).all()}


async def make_user(role: UserRole = UserRole.ENGINEER, email: str | None = None) -> User:
    async with TestingSessionLocal() as db:
        user = User(
            id=uuid.uuid4(), auth_subject=str(uuid.uuid4()), email=email or f"u{uuid.uuid4().hex[:8]}@example.com",
            full_name="Member", role=role, is_active=True,
        )
        db.add(user)
        await db.commit()
        return user


def hdr(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_for(user)}"}


async def make_job(owner: User, job_type: str = "full-time") -> uuid.UUID:
    from app.domains.companies.models import CompanyProfile
    from app.domains.jobs.models import JobPost

    async with TestingSessionLocal() as db:
        company = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == owner.id))
        if company is None:
            company = CompanyProfile(user_id=owner.id, name="Acme")
            db.add(company)
            await db.flush()
        job = JobPost(
            company_id=company.id, title="Writer", slug=f"w-{uuid.uuid4().hex[:6]}", description="x",
            company_name="Acme", is_remote=True, skills=[], source="DIRECT", job_type=job_type,
        )
        db.add(job)
        await db.commit()
        return job.id


def signed(event: dict) -> tuple[bytes, dict[str, str]]:
    body = json.dumps(event).encode()
    t = int(time.time())
    sig = hmac.new(WHSEC.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return body, {"stripe-signature": f"t={t},v1={sig}", "content-type": "application/json"}


async def send(client: AsyncClient, kind: str, obj: dict, event_id: str | None = None):
    event = {"id": event_id or f"evt_{uuid.uuid4().hex}", "object": "event", "type": kind, "data": {"object": obj}}
    body, headers = signed(event)
    return await client.post("/api/v1/payments/webhooks/stripe", content=body, headers=headers)


async def checkout(client: AsyncClient, user: User, plan: str, subject: str | None = None) -> Purchase:
    resp = await client.post("/api/v1/billing/checkout", headers=hdr(user), json={"plan": plan, "subject_id": subject})
    assert resp.status_code == 200, resp.text
    async with TestingSessionLocal() as db:
        return await db.scalar(select(Purchase).where(Purchase.stripe_checkout_session_id == SESSIONS[-1]))


async def complete(client: AsyncClient, purchase: Purchase, **extra: Any):
    obj = {
        "id": purchase.stripe_checkout_session_id, "object": "checkout.session", "payment_status": "paid",
        "amount_total": 4900, "payment_intent": f"pi_{uuid.uuid4().hex[:8]}", "customer": "cus_test_x",
        "metadata": {"purchase_id": str(purchase.id), "user_id": str(purchase.user_id)},
    }
    obj.update(extra)
    return await send(client, "checkout.session.completed", obj)


# ── gate and key guard ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("key", "env", "enabled", "ok"),
    [
        ("sk_test_1", "development", False, True),
        ("rk_test_1", "test", True, True),
        ("sk_live_1", "development", True, False),
        ("sk_live_1", "production", False, False),
        ("sk_live_1", "production", True, True),
        ("pk_test_1", "development", True, False),
        ("", "development", True, False),
    ],
)
def test_live_key_only_in_production_with_billing_on(monkeypatch, key, env, enabled, ok):
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", key)
    monkeypatch.setattr(settings, "APP_ENV", env)
    monkeypatch.setattr(settings, "BILLING_ENABLED", enabled)
    assert gateway.configured() is ok
    if not ok:
        with pytest.raises(gateway.BillingConfigError):
            gateway.api_key()


@pytest.mark.asyncio
async def test_disabled_billing_shows_catalog_but_nothing_is_chargeable(client: AsyncClient, fake_stripe):
    await seed_catalog()
    user = await make_user()
    cat = (await client.get("/api/v1/billing/catalog")).json()
    assert cat["enabled"] is False
    assert cat["prices_include_vat"] is True
    slugs = {i["slug"]: i for i in cat["items"]}
    assert slugs["featured_job"]["price_cents"] == 4900
    assert slugs["premium_yearly"]["price_cents"] == 7900
    assert slugs["verified_badge"]["is_active"] is False
    assert (await client.post("/api/v1/billing/checkout", headers=hdr(user), json={"plan": "hire"})).status_code == 404
    assert (await client.post("/api/v1/billing/portal", headers=hdr(user))).status_code == 404
    assert (await client.post("/api/v1/billing/sponsored", headers=hdr(user), json={"job_id": str(uuid.uuid4()), "daily_budget_cents": 500})).status_code == 404
    placements_ = (await client.get("/api/v1/billing/placements/jobs")).json()
    assert placements_ == {"featured": [], "sponsored": []}
    assert fake_stripe.calls == []


@pytest.mark.asyncio
async def test_webhook_is_off_without_billing_or_marketplace(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", WHSEC)
    resp = await send(client, "invoice.paid", {"id": "in_1"})
    assert resp.status_code == 404


# ── checkout ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_checkout_uses_tax_tax_ids_promotion_codes_and_waiver(client, billing_on, fake_stripe, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_TAX_ENABLED", True)
    await seed_catalog()
    employer = await make_user(UserRole.COMPANY)
    job = await make_job(employer)
    purchase = await checkout(client, employer, "featured_job", str(job))
    params = fake_stripe.named("checkout")[0]
    assert params["mode"] == "payment"
    assert params["automatic_tax"] == {"enabled": True}
    assert params["tax_id_collection"] == {"enabled": True}
    assert params["billing_address_collection"] == "required"
    assert params["allow_promotion_codes"] is True
    assert params["consent_collection"] == {"terms_of_service": "required"}
    assert "right of withdrawal" in params["custom_text"]["submit"]["message"]
    assert params["line_items"] == [{"price": "price_featured_job", "quantity": 1}]
    assert params["metadata"]["purchase_id"] == str(purchase.id)
    assert purchase.status == "pending"
    assert purchase.subject_id == str(job)
    # One Stripe customer per member, reused.
    await checkout(client, employer, "urgent_badge", str(job))
    assert len(fake_stripe.named("customer")) == 1


@pytest.mark.asyncio
async def test_checkout_validates_targets_and_availability(client, billing_on, fake_stripe):
    await seed_catalog()
    employer, other = await make_user(), await make_user()
    job = await make_job(employer)
    post = lambda u, body: client.post("/api/v1/billing/checkout", headers=hdr(u), json=body)  # noqa: E731
    assert (await post(employer, {"plan": "featured_job"})).status_code == 422
    assert (await post(other, {"plan": "featured_job", "subject_id": str(job)})).status_code == 404
    assert (await post(employer, {"plan": "featured_job", "subject_id": "nope"})).status_code == 422
    assert (await post(employer, {"plan": "verified_badge"})).status_code == 404
    assert (await post(employer, {"plan": "missing"})).status_code == 404
    assert (await post(employer, {"plan": "hire", "quantity": 3})).status_code == 422
    assert (await post(employer, {"plan": "profile_boost"})).status_code == 409  # no profile yet
    async with TestingSessionLocal() as db:
        plan = await db.scalar(select(Plan).where(Plan.slug == "hire"))
        plan.stripe_price_id = None
        await db.commit()
    assert (await post(employer, {"plan": "hire"})).status_code == 409
    assert (await post(employer, {"plan": "extra_seat", "quantity": 3})).status_code == 200


@pytest.mark.asyncio
async def test_premium_trial_is_offered_once(client, billing_on, fake_stripe):
    await seed_catalog()
    member = await make_user()
    purchase = await checkout(client, member, "premium_monthly")
    assert fake_stripe.named("checkout")[0]["subscription_data"]["trial_period_days"] == 7
    await complete(client, purchase, subscription="sub_trial", amount_total=0, payment_status="no_payment_required")
    await checkout(client, member, "premium_monthly")
    assert "trial_period_days" not in fake_stripe.named("checkout")[1]["subscription_data"]
    await checkout(client, member, "premium_yearly")
    assert "trial_period_days" not in fake_stripe.named("checkout")[2]["subscription_data"]


@pytest.mark.asyncio
async def test_checkout_without_stripe_tax_requests_no_tax(client, billing_on, fake_stripe, monkeypatch):
    from app.services import slack

    alerts: list[str] = []
    monkeypatch.setattr(slack, "notify", lambda channel, text, **k: alerts.append(channel))
    fake_stripe.fail_tax_once = True  # would fail if tax were requested
    await seed_catalog()
    member = await make_user()
    await checkout(client, member, "ai_pack_5")
    (only,) = fake_stripe.named("checkout")
    assert "automatic_tax" not in only
    assert "tax_id_collection" not in only
    assert alerts == []
    assert (await client.get("/api/v1/billing/catalog")).json()["tax_calculated"] is False


@pytest.mark.asyncio
async def test_checkout_falls_back_when_stripe_tax_is_off(client, billing_on, fake_stripe, monkeypatch):
    from app.services import slack

    monkeypatch.setattr(settings, "STRIPE_TAX_ENABLED", True)

    alerts: list[str] = []
    monkeypatch.setattr(slack, "notify", lambda channel, text, **k: alerts.append(channel))
    fake_stripe.fail_tax_once = True
    await seed_catalog()
    member = await make_user()
    await checkout(client, member, "ai_pack_5")
    first, second = fake_stripe.named("checkout")
    assert "automatic_tax" in first
    assert "automatic_tax" not in second
    assert "tax_id_collection" not in second
    assert alerts == ["errors", "payments"]


@pytest.mark.asyncio
async def test_checkout_stripe_failure_charges_nothing(client, billing_on, monkeypatch, fake_stripe):
    def boom(**_: Any):
        raise stripe.APIConnectionError("down")

    monkeypatch.setattr(stripe.checkout.Session, "create", boom)
    await seed_catalog()
    member = await make_user()
    resp = await client.post("/api/v1/billing/checkout", headers=hdr(member), json={"plan": "ai_pack_5"})
    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_checkout_misconfigured_key_is_503(client, billing_on, monkeypatch, fake_stripe):
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_live_nope")  # APP_ENV is not production
    await seed_catalog()
    member = await make_user()
    resp = await client.post("/api/v1/billing/checkout", headers=hdr(member), json={"plan": "ai_pack_5"})
    assert resp.status_code == 503
    assert fake_stripe.calls == []


# ── webhook ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_webhook_rejects_bad_signatures(client, billing_on):
    event = {"id": "evt_bad", "type": "invoice.paid", "data": {"object": {"id": "in_1"}}}
    body, headers = signed(event)
    headers["stripe-signature"] = headers["stripe-signature"][:-4] + "beef"
    assert (await client.post("/api/v1/payments/webhooks/stripe", content=body, headers=headers)).status_code == 400


@pytest.mark.asyncio
async def test_featured_job_purchase_is_granted_once_and_labelled(client, billing_on, fake_stripe):
    await seed_catalog()
    employer = await make_user()
    job = await make_job(employer)
    purchase = await checkout(client, employer, "featured_job", str(job))
    event_id = "evt_fixed"
    obj = {
        "id": purchase.stripe_checkout_session_id, "payment_status": "paid", "amount_total": 4900,
        "payment_intent": "pi_feat", "customer": "cus_x", "metadata": {"purchase_id": str(purchase.id)},
    }
    assert (await send(client, "checkout.session.completed", obj, event_id)).json() == {"received": True}
    assert (await send(client, "checkout.session.completed", obj, event_id)).json()["duplicate"] is True
    await send(client, "checkout.session.completed", obj)  # same session, new event id
    async with TestingSessionLocal() as db:
        rows = (await db.scalars(select(Entitlement).where(Entitlement.key == "featured_job"))).all()
        assert len(rows) == 1
        assert rows[0].subject_id == str(job)
        assert rows[0].expires_at is not None
        p = await db.get(Purchase, purchase.id)
        assert p.status == "paid"
        assert p.fulfilment_status == "done"
        assert p.amount_total == 4900
    listed = (await client.get("/api/v1/jobs", params={"is_remote": True})).json()
    assert [j["promotions"] for j in listed if j["id"] == str(job)] == [["featured"]]
    single = (await client.get(f"/api/v1/jobs/{job}")).json()
    assert single["promotions"] == ["featured"]
    featured = (await client.get("/api/v1/billing/placements/jobs")).json()["featured"]
    assert featured[0]["label"] == "Featured"
    assert featured[0]["job"]["id"] == str(job)


@pytest.mark.asyncio
async def test_unpaid_or_unknown_sessions_grant_nothing(client, billing_on, fake_stripe):
    await seed_catalog()
    member = await make_user()
    purchase = await checkout(client, member, "ai_pack_10")
    await complete(client, purchase, payment_status="unpaid")
    await send(client, "checkout.session.completed", {"id": "cs_unknown", "metadata": {}})
    await send(client, "checkout.session.expired", {"id": purchase.stripe_checkout_session_id})
    async with TestingSessionLocal() as db:
        assert (await db.get(Purchase, purchase.id)).status == "expired"
        assert await grants.balance(db, member.id, "ai_tokens") == 0


@pytest.mark.asyncio
async def test_subscription_lifecycle_grants_renews_and_revokes(client, billing_on, fake_stripe, monkeypatch):
    sent: list[str] = []

    async def fake_enqueue(db, user_id, event_key, kind, subject, html):
        sent.append(event_key)
        return True

    import app.services.email.outbox as outbox

    monkeypatch.setattr(outbox, "enqueue_email", fake_enqueue)
    await seed_catalog()
    employer = await make_user()
    purchase = await checkout(client, employer, "hire_pro")
    async with TestingSessionLocal() as db:
        cus = (await db.get(BillingCustomer, employer.id)).stripe_customer_id
    await complete(client, purchase, subscription="sub_123", amount_total=29900, customer=cus)
    async with TestingSessionLocal() as db:
        assert await grants.has_entitlement(db, employer.id, "candidate_search")
        assert (await placements.messaging_status(db, employer.id))["included_monthly"] == 50
    period_end = int((datetime.now(UTC) + timedelta(days=30)).timestamp())
    sub_obj = {
        "id": "sub_123", "customer": cus, "status": "active", "cancel_at_period_end": True,
        "current_period_end": period_end,
        "items": {"data": [{"quantity": 1, "price": {"id": "price_hire_pro", "lookup_key": "rap_hire_pro"}}]},
    }
    await send(client, "customer.subscription.updated", sub_obj)
    invoice = {
        "id": "in_1", "customer": cus, "subscription": "sub_123", "amount_paid": 29900, "currency": "eur",
        "hosted_invoice_url": "https://invoice.stripe.com/i/1", "invoice_pdf": "https://pay.stripe.com/pdf/1",
        "lines": {"data": [{"period": {"start": period_end - 2592000, "end": period_end}}]},
    }
    await send(client, "invoice.paid", invoice)
    await send(client, "invoice.paid", invoice)
    await send(client, "invoice.payment_failed", {"id": "in_2", "customer": cus, "attempt_count": 1})
    assert sent == ["billing-dunning:in_2:1"]
    me = (await client.get("/api/v1/billing/me", headers=hdr(employer))).json()
    assert me["subscriptions"][0]["plan"] == "hire_pro"
    assert me["subscriptions"][0]["cancel_at_period_end"] is True
    assert len(me["invoices"]) == 1
    assert me["invoices"][0]["invoice_pdf"].startswith("https://")
    # Downgrade to Hire in the portal: candidate search goes, Hire grants stay.
    sub_obj["items"]["data"][0]["price"] = {"id": "price_hire"}
    await send(client, "customer.subscription.updated", sub_obj)
    async with TestingSessionLocal() as db:
        assert not await grants.has_entitlement(db, employer.id, "candidate_search")
        assert await grants.has_entitlement(db, employer.id, "featured_eligible_posts")
    await send(client, "customer.subscription.deleted", {**sub_obj, "status": "canceled"})
    async with TestingSessionLocal() as db:
        assert not await grants.has_entitlement(db, employer.id, "featured_eligible_posts")
        sub = await db.scalar(select(Subscription).where(Subscription.stripe_subscription_id == "sub_123"))
        assert sub.status == "canceled"
        assert (await db.scalar(select(Invoice))).amount_paid == 29900


@pytest.mark.asyncio
async def test_extra_seats_follow_quantity_and_unknown_subscriptions_are_ignored(client, billing_on, fake_stripe):
    await seed_catalog()
    employer = await make_user()
    async with TestingSessionLocal() as db:
        db.add(BillingCustomer(user_id=employer.id, stripe_customer_id="cus_seats"))
        await db.commit()
    obj = {"id": "sub_seats", "customer": "cus_seats", "status": "active",
           "items": {"data": [{"quantity": 3, "price": {"id": "price_extra_seat"}}]}}
    await send(client, "customer.subscription.created", obj)
    await send(client, "customer.subscription.updated", {"id": "sub_x", "customer": "cus_none", "items": {"data": []}})
    async with TestingSessionLocal() as db:
        assert await grants.balance(db, employer.id, "team_seats") == 3


@pytest.mark.asyncio
async def test_refunds_revoke_full_and_keep_partial(client, billing_on, fake_stripe):
    await seed_catalog()
    member = await make_user()
    full = await checkout(client, member, "ai_pack_10")
    await complete(client, full, payment_intent="pi_full", amount_total=1000)
    part = await checkout(client, member, "proposal_pack_20")
    await complete(client, part, payment_intent="pi_part", amount_total=600)
    await send(client, "charge.refunded", {"payment_intent": "pi_full", "amount": 1000, "amount_refunded": 1000, "refunded": True})
    await send(client, "charge.refunded", {"payment_intent": "pi_part", "amount": 600, "amount_refunded": 100, "refunded": False})
    await send(client, "charge.refunded", {"payment_intent": "pi_unknown", "amount_refunded": 1})
    async with TestingSessionLocal() as db:
        assert (await db.get(Purchase, full.id)).status == "refunded"
        assert await grants.balance(db, member.id, "ai_tokens") == 0
        assert (await db.get(Purchase, part.id)).status == "partially_refunded"
        assert await grants.balance(db, member.id, "proposal_credits") == 20


@pytest.mark.asyncio
async def test_social_boost_is_queued_for_staff(client, billing_on, fake_stripe):
    await seed_catalog()
    employer = await make_user()
    job = await make_job(employer)
    purchase = await checkout(client, employer, "social_boost", str(job))
    await complete(client, purchase, amount_total=2900)
    async with TestingSessionLocal() as db:
        assert (await db.get(Purchase, purchase.id)).fulfilment_status == "queued"


# ── features using entitlements ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_feature_job_with_pack_credit_or_plan(client, billing_on, fake_stripe):
    await seed_catalog()
    employer = await make_user()
    job1, job2, job3 = await make_job(employer), await make_job(employer), await make_job(employer)
    url = lambda j: f"/api/v1/billing/jobs/{j}/feature"  # noqa: E731
    assert (await client.post(url(job1), headers=hdr(employer))).status_code == 402
    purchase = await checkout(client, employer, "job_pack_5")
    await complete(client, purchase, amount_total=19900)
    assert (await client.post(url(job1), headers=hdr(employer))).status_code == 200
    assert (await client.post(url(job1), headers=hdr(employer))).status_code == 409
    async with TestingSessionLocal() as db:
        assert await grants.balance(db, employer.id, "featured_job_credits") == 4
        await grants.grant(db, user_id=employer.id, key="featured_eligible_posts", quantity=1,
                           source="subscription", source_ref="sub_hire")
        await db.commit()
    assert (await client.post(url(job2), headers=hdr(employer))).status_code == 200
    async with TestingSessionLocal() as db:
        assert await grants.balance(db, employer.id, "featured_job_credits") == 4
    other = await make_user()
    assert (await client.post(url(job3), headers=hdr(other))).status_code == 404


@pytest.mark.asyncio
async def test_sponsored_clicks_filter_bots_duplicates_and_budget(client, billing_on, fake_stripe):
    await seed_catalog()
    employer = await make_user()
    job = await make_job(employer)
    created = await client.post("/api/v1/billing/sponsored", headers=hdr(employer),
                                json={"job_id": str(job), "daily_budget_cents": 100})
    assert created.status_code == 201
    assert created.json()["status"] == "exhausted"
    assert created.json()["max_cpc_cents"] == 50
    cid = created.json()["id"]
    purchase = await checkout(client, employer, "sponsored_topup_50")
    await complete(client, purchase, amount_total=5000)
    assert (await client.patch(f"/api/v1/billing/sponsored/{cid}", headers=hdr(employer), json={"status": "active"})).json()["status"] == "active"
    shown = (await client.get("/api/v1/billing/placements/jobs")).json()["sponsored"]
    assert shown[0]["label"] == "Sponsored"
    assert shown[0]["job"]["id"] == str(job)
    click = lambda ua, ip="1.1.1.1", h=None: client.post(  # noqa: E731
        f"/api/v1/billing/placements/sponsored/{cid}/click",
        headers={"user-agent": ua, "cf-connecting-ip": ip, **(h or {})},
    )
    assert (await click("Googlebot/2.1")).json()["reason"] == "bot"
    assert (await click("Mozilla/5.0", h=hdr(employer))).json()["reason"] == "own"
    assert (await click("Mozilla/5.0")).json() == {"charged": True, "cost_cents": 50}
    assert (await click("Mozilla/5.0")).json()["reason"] == "duplicate"
    assert (await click("Mozilla/5.0", "2.2.2.2")).json()["charged"] is True
    assert (await click("Mozilla/5.0", "3.3.3.3")).json()["reason"] == "daily_budget"
    async with TestingSessionLocal() as db:
        assert await grants.balance(db, employer.id, "ad_balance_cents") == 4900
        assert len((await db.scalars(select(AdClick))).all()) == 2
        assert (await db.get(SponsoredCampaign, uuid.UUID(cid))).spent_cents == 100
    mine = (await client.get("/api/v1/billing/sponsored", headers=hdr(employer))).json()
    assert mine[0]["spent_cents"] == 100
    assert (await client.post("/api/v1/billing/sponsored", headers=hdr(employer),
                              json={"job_id": str(job), "daily_budget_cents": 500})).status_code == 409


@pytest.mark.asyncio
async def test_sponsorship_stops_when_balance_is_exhausted(billing_on):
    employer = await make_user()
    job = await make_job(employer)
    async with TestingSessionLocal() as db:
        await grants.grant(db, user_id=employer.id, key="ad_balance_cents", quantity=60, source="staff", source_ref="s1")
        c = SponsoredCampaign(user_id=employer.id, job_id=job, daily_budget_cents=1000, max_cpc_cents=50)
        db.add(c)
        await db.flush()
        first = await placements.record_click(db, c.id, visitor="a", user_agent="Mozilla", viewer_id=None)
        assert first["charged"] is True
        assert c.status == "exhausted"
        assert (await placements.record_click(db, c.id, visitor="b", user_agent="Mozilla", viewer_id=None))["reason"] == "inactive"
        assert (await placements.placement_jobs(db))["sponsored"] == []


@pytest.mark.asyncio
async def test_proposal_credits_free_monthly_then_packs(client, billing_on, monkeypatch):
    monkeypatch.setattr(settings, "BILLING_FREE_PROPOSALS_MONTHLY", 1)
    employer, member = await make_user(), await make_user()
    gig1, gig2, gig3 = [await make_job(employer, "freelance") for _ in range(3)]
    fulltime = await make_job(employer, "full-time")
    apply = lambda j: client.post(f"/api/v1/applications/jobs/{j}", headers=hdr(member), json={})  # noqa: E731
    assert (await apply(gig1)).status_code == 201
    assert (await apply(gig2)).status_code == 402
    assert (await apply(fulltime)).status_code == 201  # job applications are never paid
    async with TestingSessionLocal() as db:
        await grants.grant(db, user_id=member.id, key="proposal_credits", quantity=1, source="purchase",
                           source_ref="p1", expires_at=grants.expiry(365))
        await db.commit()
    assert (await apply(gig2)).status_code == 201
    async with TestingSessionLocal() as db:
        status = await placements.proposals_status(db, member.id)
        assert status["available"] == 0
        assert status["used_this_month"] == 1
    assert (await apply(gig3)).status_code == 402


@pytest.mark.asyncio
async def test_messaging_credit_returned_without_reply(client, billing_on):
    from app.domains.network.models import Conversation, Message

    employer, quiet, chatty = await make_user(), await make_user(), await make_user()
    assert (await client.post("/api/v1/billing/messages/spend", headers=hdr(employer),
                              json={"recipient_id": str(quiet.id)})).status_code == 402
    async with TestingSessionLocal() as db:
        await grants.grant(db, user_id=employer.id, key="messaging_credits", quantity=2, source="purchase", source_ref="m1")
        await db.commit()
    for r in (quiet, chatty):
        assert (await client.post("/api/v1/billing/messages/spend", headers=hdr(employer),
                                  json={"recipient_id": str(r.id)})).status_code == 200
    assert (await client.post("/api/v1/billing/messages/spend", headers=hdr(employer),
                              json={"recipient_id": str(employer.id)})).status_code == 422
    async with TestingSessionLocal() as db:
        old = datetime.now(UTC) - timedelta(days=15)
        for spend in (await db.scalars(select(MessageCreditSpend))).all():
            spend.spent_at = old
        conv = Conversation(participant_one_id=employer.id, participant_two_id=chatty.id)
        db.add(conv)
        await db.flush()
        db.add(Message(conversation_id=conv.id, sender_id=chatty.id, content="hi"))
        await db.commit()
        result = await placements.refund_unanswered_messages(db)
        await db.commit()
        assert result == {"refunded": 1, "replied": 1}
        assert await grants.balance(db, employer.id, "messaging_credits") == 1


@pytest.mark.asyncio
async def test_monthly_messaging_credit_is_returned_to_its_month(billing_on):
    employer, member = await make_user(), await make_user()
    async with TestingSessionLocal() as db:
        await grants.grant(db, user_id=employer.id, key="messaging_credits_monthly", quantity=1,
                           source="subscription", source_ref="sub_m")
        spend = await placements.spend_message_credit(db, employer.id, member.id)
        assert spend.entitlement_id is None
        assert await placements.spend_message_credit(db, employer.id, member.id) is None
        spend.spent_at = datetime.now(UTC) - timedelta(days=20)
        await db.flush()
        await placements.refund_unanswered_messages(db)
        month = grants.month_key(spend.spent_at)
        assert await grants.usage(db, employer.id, "messaging", month) == 0


@pytest.mark.asyncio
async def test_ai_allowance_premium_multiplier_and_packs(billing_on, monkeypatch):
    from app.services.ai import metering

    monkeypatch.setattr(settings, "AI_FREE_MONTHLY_TOKENS", 1000)
    member = await make_user()
    async with TestingSessionLocal() as db:
        actor = metering.AIActor(user_id=member.id, db=db)
        assert await metering.monthly_allowance(actor) == 1000
        await grants.grant(db, user_id=member.id, key="ai_allowance_multiplier", quantity=5,
                           source="subscription", source_ref="sub_p")
        await grants.grant(db, user_id=member.id, key="ai_tokens", quantity=300, source="purchase", source_ref="pk")
        await db.commit()
        assert await metering.monthly_allowance(actor) == 5300
        assert await placements.draw_ai_packs(db, member.id, 1000, 5100) == 100
        assert await placements.draw_ai_packs(db, member.id, 1000, 5100) == 0
        assert await grants.balance(db, member.id, "ai_tokens") == 200
        assert await metering.monthly_allowance(actor) == 5300  # drawn tokens still count this month
    monkeypatch.setattr(settings, "BILLING_ENABLED", False)
    async with TestingSessionLocal() as db:
        assert await metering.monthly_allowance(metering.AIActor(user_id=member.id, db=db)) == 1000


@pytest.mark.asyncio
async def test_settle_draws_pack_tokens(billing_on, monkeypatch):
    from app.services.ai import metering
    from app.services.ai.models import AIUsageLog

    monkeypatch.setattr(settings, "AI_FREE_MONTHLY_TOKENS", 10)
    member = await make_user()
    async with TestingSessionLocal() as db:
        await grants.grant(db, user_id=member.id, key="ai_tokens", quantity=100, source="purchase", source_ref="pk2")
        row = AIUsageLog(user_id=member.id, status="RESERVED", total_tokens=5)
        db.add(row)
        await db.commit()
    await metering.settle_ai_tokens(row.id, total_tokens=40, status="SUCCESS")
    async with TestingSessionLocal() as db:
        assert await grants.balance(db, member.id, "ai_tokens") == 70


@pytest.mark.asyncio
async def test_candidate_search_needs_entitlement_and_opt_in(client, billing_on):
    from app.domains.engineers.models import EngineerProfile

    employer, open_, closed = await make_user(), await make_user(), await make_user()
    async with TestingSessionLocal() as db:
        db.add(EngineerProfile(user_id=open_.id, headline="Python writer", is_open_to_work=True))
        db.add(EngineerProfile(user_id=closed.id, headline="Python editor", is_open_to_work=False))
        await db.commit()
    assert (await client.get("/api/v1/billing/candidates", headers=hdr(employer))).status_code == 402
    async with TestingSessionLocal() as db:
        await grants.grant(db, user_id=employer.id, key="candidate_search", quantity=1, source="subscription", source_ref="s_c")
        await db.commit()
    found = (await client.get("/api/v1/billing/candidates", params={"q": "Python"}, headers=hdr(employer))).json()
    assert [f["user_id"] for f in found] == [str(open_.id)]


@pytest.mark.asyncio
async def test_promoted_profiles_and_badges(client, billing_on, fake_stripe):
    from app.domains.engineers.models import EngineerProfile

    await seed_catalog()
    member, viewer = await make_user(), await make_user()
    async with TestingSessionLocal() as db:
        profile = EngineerProfile(user_id=member.id, headline="Designer")
        db.add(profile)
        await db.commit()
    purchase = await checkout(client, member, "profile_boost")
    await complete(client, purchase, amount_total=500)
    assert (await client.get("/api/v1/billing/placements/profiles")).json() == [str(profile.id)]
    premium = await checkout(client, member, "premium_yearly")
    await complete(client, premium, subscription="sub_prem", amount_total=7900)
    got = (await client.post("/api/v1/billing/badges", headers=hdr(viewer), json={"user_ids": [str(member.id)]})).json()
    assert sorted(got[str(member.id)]) == ["premium_badge", "priority_applicant"]


@pytest.mark.asyncio
async def test_referral_credit_on_first_payment(client, billing_on, fake_stripe):
    await seed_catalog()
    referrer, friend = await make_user(), await make_user()
    code = (await client.get("/api/v1/billing/referral", headers=hdr(referrer))).json()["code"]
    assert (await client.post("/api/v1/billing/referral/claim", headers=hdr(referrer), json={"code": code})).status_code == 404
    assert (await client.post("/api/v1/billing/referral/claim", headers=hdr(friend), json={"code": code})).status_code == 200
    assert (await client.post("/api/v1/billing/referral/claim", headers=hdr(friend), json={"code": code})).status_code == 409
    purchase = await checkout(client, friend, "ai_pack_5")
    await complete(client, purchase, amount_total=500)
    await complete(client, purchase, amount_total=500)
    credits = fake_stripe.named("balance")
    assert len(credits) == 2
    assert all(c["amount"] == -1000 for c in credits)
    async with TestingSessionLocal() as db:
        ref = await db.scalar(select(Referral))
        assert ref.rewarded_at is not None
        assert ref.referrer_credited_at is not None
        assert ref.referred_credited_at is not None


# ── account deletion and export ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_account_deletion_cancels_subscriptions_at_period_end(client, billing_on, fake_stripe, monkeypatch):
    await seed_catalog()
    member = await make_user()
    purchase = await checkout(client, member, "premium_monthly")
    await complete(client, purchase, subscription="sub_del", amount_total=900)

    def fail(*a: Any, **k: Any):
        raise stripe.APIConnectionError("down")

    monkeypatch.setattr(stripe.Subscription, "modify", fail)
    resp = await client.request("DELETE", "/api/v1/auth/me", headers=hdr(member), json={"confirm": "DELETE"})
    assert resp.status_code == 503
    fake_stripe.install(monkeypatch)
    resp = await client.request("DELETE", "/api/v1/auth/me", headers=hdr(member), json={"confirm": "DELETE"})
    assert resp.status_code in (200, 204), resp.text
    modify = fake_stripe.named("sub_modify")
    assert modify
    assert modify[0]["args"] == ("sub_del",)
    assert modify[0]["cancel_at_period_end"] is True
    async with TestingSessionLocal() as db:
        kept = await db.get(Purchase, purchase.id)
        assert kept is not None
        assert kept.status == "paid"


@pytest.mark.asyncio
async def test_export_includes_billing_without_provider_ids(client, billing_on, fake_stripe):
    await seed_catalog()
    member = await make_user()
    purchase = await checkout(client, member, "ai_pack_5")
    await complete(client, purchase, amount_total=500)
    data = (await client.get("/api/v1/auth/me/export", headers=hdr(member))).json()
    row = data["billing_purchases"][0]
    assert row["plan_slug"] == "ai_pack_5"
    assert "stripe_checkout_session_id" not in row
    assert "stripe_payment_intent_id" not in row
    assert data["entitlements"][0]["key"] == "ai_tokens"
    assert "source_ref" not in data["entitlements"][0]


# ── staff console ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_staff_billing_console(client, billing_on, fake_stripe):
    await seed_catalog()
    admin, member = await make_user(UserRole.ADMIN), await make_user()
    assert (await client.get("/api/v1/admin/billing/purchases", headers=hdr(member))).status_code == 403
    purchase = await checkout(client, member, "ai_pack_5")
    await complete(client, purchase, amount_total=500, payment_intent="pi_staff")
    sub = await checkout(client, member, "premium_yearly")
    await complete(client, sub, subscription="sub_rev", amount_total=7900)
    h = hdr(admin)
    assert len((await client.get("/api/v1/admin/billing/purchases", headers=h, params={"status": "paid"})).json()) == 2
    assert len((await client.get("/api/v1/admin/billing/subscriptions", headers=h)).json()) == 1
    ents = (await client.get("/api/v1/admin/billing/entitlements", headers=h, params={"user_id": str(member.id)})).json()
    assert {e["key"] for e in ents} >= {"ai_tokens", "premium_badge"}
    refund = await client.post(f"/api/v1/admin/billing/purchases/{purchase.id}/refund", headers=h,
                               json={"reason": "Customer asked", "amount_cents": 500})
    assert refund.status_code == 200
    assert fake_stripe.named("refund")[0]["payment_intent"] == "pi_staff"
    assert (await client.post(f"/api/v1/admin/billing/purchases/{uuid.uuid4()}/refund", headers=h,
                              json={"reason": "missing purchase"})).status_code == 404
    granted = await client.post("/api/v1/admin/billing/entitlements", headers=h,
                                json={"reason": "Goodwill", "user_id": str(member.id), "key": "proposal_credits", "quantity": 5, "days": 30})
    assert granted.status_code == 201
    revoked = await client.post(f"/api/v1/admin/billing/entitlements/{granted.json()['id']}/revoke", headers=h, json={"reason": "Mistake"})
    assert revoked.json()["revoked_at"] is not None
    fulfil = await client.post(f"/api/v1/admin/billing/purchases/{purchase.id}/fulfilment", headers=h,
                               json={"reason": "Posted", "fulfilment_status": "done"})
    assert fulfil.json()["fulfilment_status"] == "done"
    plans = (await client.get("/api/v1/admin/billing/plans", headers=h)).json()
    assert len(plans) == len(CATALOG)
    edited = await client.patch("/api/v1/admin/billing/plans/hire", headers=h,
                                json={"reason": "Launch price", "price_cents": 7900, "name": "Hire"})
    assert edited.json()["price_cents"] == 7900
    assert fake_stripe.named("price")[0]["unit_amount"] == 7900
    assert fake_stripe.named("price")[0]["recurring"] == {"interval": "month"}
    assert (await client.patch("/api/v1/admin/billing/plans/free", headers=h, json={"reason": "not sellable", "is_active": False})).status_code == 404
    revenue = (await client.get("/api/v1/admin/billing/revenue", headers=h)).json()
    assert revenue["mrr_cents"] == round(7900 / 12)
    assert revenue["active_subscriptions"] == 1
    assert revenue["one_off_revenue_cents_total"] == 500
    sweep = await client.post("/api/v1/admin/billing/messages/refund-sweep", headers=h)
    assert sweep.json() == {"refunded": 0, "replied": 0}


@pytest.mark.asyncio
async def test_portal_session(client, billing_on, fake_stripe):
    member = await make_user()
    assert (await client.post("/api/v1/billing/portal", headers=hdr(member))).status_code == 404
    async with TestingSessionLocal() as db:
        db.add(BillingCustomer(user_id=member.id, stripe_customer_id="cus_portal"))
        await db.commit()
    resp = await client.post("/api/v1/billing/portal", headers=hdr(member))
    assert resp.json()["url"].startswith("https://billing.stripe.com/")
    assert fake_stripe.named("portal")[0]["customer"] == "cus_portal"


def test_catalog_is_consistent():
    slugs = [c["slug"] for c in CATALOG]
    assert len(slugs) == len(set(slugs))
    by = {c["slug"]: c for c in CATALOG}
    assert by["verified_badge"].get("enabled") is False
    assert by["premium_monthly"].get("trial_days") == 7
    assert by["freelancer_plus"]["grants"]["proposals_monthly"] == 80
    for item in CATALOG:
        assert item["mode"] in {"payment", "subscription"}
        assert (item["billing_interval"] == "one_time") == (item["mode"] == "payment")


# ── sync script ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stripe_sync_is_idempotent_and_prints_no_secrets(billing_on, monkeypatch, capsys):
    from app.scripts import stripe_sync

    await seed_catalog()
    products: set[str] = set()
    prices: dict[str, dict] = {}
    endpoints: list[dict] = []

    def retrieve(pid, **_):
        if pid not in products:
            raise stripe.InvalidRequestError("No such product", "id")
        return {"id": pid}

    def product_create(**kw):
        products.add(kw["id"])
        return {"id": kw["id"]}

    def price_list(lookup_keys, **_):
        found = prices.get(lookup_keys[0])
        return {"data": [found] if found else []}

    def price_create(**kw):
        price = {"id": f"price_{len(prices)}_{kw['lookup_key']}", "unit_amount": kw["unit_amount"],
                 "currency": kw["currency"], "recurring": kw.get("recurring")}
        prices[kw["lookup_key"]] = price
        return price

    def ep_create(**kw):
        ep = {"id": "we_1", "url": kw["url"], "secret": "whsec_SHOULD_NOT_PRINT"}
        endpoints.append(ep)
        return ep

    monkeypatch.setattr(stripe.Product, "retrieve", retrieve)
    monkeypatch.setattr(stripe.Product, "create", product_create)
    monkeypatch.setattr(stripe.Product, "modify", lambda *a, **k: {})
    monkeypatch.setattr(stripe.Price, "list", price_list)
    monkeypatch.setattr(stripe.Price, "create", price_create)
    monkeypatch.setattr(stripe.WebhookEndpoint, "list", lambda **_: {"data": endpoints})
    monkeypatch.setattr(stripe.WebhookEndpoint, "create", ep_create)
    monkeypatch.setattr(stripe.WebhookEndpoint, "modify", lambda *a, **k: {})

    assert await stripe_sync.run(dry_run=False, webhook_url=stripe_sync.DEFAULT_WEBHOOK_URL) == 0
    first = dict(prices)
    assert await stripe_sync.run(dry_run=False, webhook_url=stripe_sync.DEFAULT_WEBHOOK_URL) == 0
    assert prices == first  # nothing new on a second run
    assert "rap_verified_badge" not in products
    out = capsys.readouterr().out
    assert "whsec_" not in out
    assert "sk_test" not in out
    assert "webhook we_1 created" in out
    assert "webhook we_1 updated" in out
    async with TestingSessionLocal() as db:
        hire = await db.scalar(select(Plan).where(Plan.slug == "hire"))
        assert hire.stripe_product_id == "rap_hire"
        assert hire.stripe_price_id == first["rap_hire"]["id"]
        hire.price_cents = 8900
        await db.commit()
    assert await stripe_sync.run(dry_run=True, webhook_url=None) == 0
    assert prices["rap_hire"]["unit_amount"] == 9900  # dry run changes nothing
    assert await stripe_sync.run(dry_run=False, webhook_url=None) == 0
    assert prices["rap_hire"]["unit_amount"] == 8900
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_live_x")
    monkeypatch.setattr(settings, "APP_ENV", "development")
    with pytest.raises(gateway.BillingConfigError):
        await stripe_sync.run(dry_run=True, webhook_url=None)


def test_stripe_sync_cli_refuses_live_key_outside_production(monkeypatch, capsys):
    from app.scripts import stripe_sync

    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_live_x")
    monkeypatch.setattr(settings, "APP_ENV", "development")
    assert stripe_sync.main(["--no-webhook"]) == 2
    assert "sk_live" not in capsys.readouterr().out


@pytest.mark.asyncio
async def test_service_helpers_tolerate_odd_input(billing_on):
    member = await make_user()
    async with TestingSessionLocal() as db:
        assert await grants.consume(db, member.id, "nothing", 1) == []
        assert await grants.subjects_with(db, "featured_job", []) == set()
        await service.handle_event(db, {"type": "invoice.payment_failed", "data": {"object": {"id": "in_x"}}})
        await service.handle_event(db, {"type": "charge.refunded", "data": {"object": {}}})
        assert await service.cancel_for_deletion(db, member.id) == 0
        assert await placements.promoted_profile_ids(db) == []
