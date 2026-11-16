# ruff: noqa: F811  (pytest fixtures imported from test_billing_phase1)
"""Billing follow-ups: team seats, employer branding, composer messaging credits,
referral credit retries, STRIPE_TAX_ENABLED and the open-to-opportunities opt-in.
Stripe is mocked throughout."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import stripe
from conftest import TestingSessionLocal
from httpx import AsyncClient
from sqlalchemy import select
from test_billing_phase1 import (  # noqa: F401  (fixtures)
    billing_on,
    checkout,
    complete,
    fake_stripe,
    hdr,
    make_job,
    make_user,
    seed_catalog,
)

from app.core.config import settings
from app.domains.auth.models import UserRole
from app.domains.billing import grants, service
from app.domains.billing.models import MessageCreditSpend, Referral


async def make_company(owner) -> uuid.UUID:
    from app.domains.companies.models import CompanyProfile

    async with TestingSessionLocal() as db:
        company = CompanyProfile(user_id=owner.id, name="Acme")
        db.add(company)
        await db.commit()
        return company.id


async def give(user_id, key: str, quantity: int = 1, ref: str | None = None) -> None:
    async with TestingSessionLocal() as db:
        await grants.grant(db, user_id=user_id, key=key, quantity=quantity, source="staff",
                           source_ref=ref or f"t:{uuid.uuid4()}")
        await db.commit()


# ── team seats ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_invites_beyond_seats_are_blocked_until_a_seat_is_added(client: AsyncClient, billing_on, monkeypatch):
    monkeypatch.setattr(settings, "BILLING_FREE_TEAM_SEATS", 1)
    owner, a, b = await make_user(UserRole.COMPANY), await make_user(), await make_user()
    company = await make_company(owner)
    invite = lambda u: client.post(f"/api/v1/organisations/{company}/members", headers=hdr(owner),  # noqa: E731
                                   json={"email": u.email, "role": "member"})
    assert (await invite(a)).status_code == 201
    blocked = await invite(b)
    assert blocked.status_code == 402
    assert "Extra team seat" in blocked.json()["detail"]
    assert (await invite(a)).status_code == 201  # re-inviting a pending invite uses no new seat
    seats = (await client.get(f"/api/v1/organisations/{company}/seats", headers=hdr(owner))).json()
    assert seats == {"enforced": True, "used": 1, "free": 1, "paid": 0, "included": 1, "available": 0}
    await give(owner.id, "team_seats", 1)
    assert (await invite(b)).status_code == 201


@pytest.mark.asyncio
async def test_seats_not_enforced_while_billing_is_off(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "BILLING_FREE_TEAM_SEATS", 0)
    owner, a = await make_user(UserRole.COMPANY), await make_user()
    company = await make_company(owner)
    resp = await client.post(f"/api/v1/organisations/{company}/members", headers=hdr(owner),
                             json={"email": a.email, "role": "member"})
    assert resp.status_code == 201


# ── employer branding ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_branding_editor_requires_entitlement_and_http_links(client: AsyncClient, billing_on):
    owner, stranger = await make_user(UserRole.COMPANY), await make_user()
    company = await make_company(owner)
    h = hdr(owner)
    assert (await client.put("/api/v1/billing/branding/me", headers=h, json={"cover_video_url": "https://v.example/1"})).status_code == 402
    assert (await client.get(f"/api/v1/billing/branding/{company}")).json() == {"enabled": False, "cover_video_url": None, "testimonials": []}
    await give(owner.id, "employer_branding")
    assert (await client.put("/api/v1/billing/branding/me", headers=h, json={"cover_video_url": "javascript:alert(1)"})).status_code == 422
    saved = await client.put("/api/v1/billing/branding/me", headers=h, json={"cover_video_url": "https://video.example/intro"})
    assert saved.json()["cover_video_url"] == "https://video.example/intro"
    t = (await client.post("/api/v1/billing/branding/me/testimonials", headers=h,
                           json={"author_name": "Sam", "author_title": "Engineer", "quote": "Great team"})).json()
    edited = await client.put(f"/api/v1/billing/branding/me/testimonials/{t['id']}", headers=h,
                              json={"author_name": "Sam", "quote": "Great people"})
    assert edited.json()["quote"] == "Great people"
    assert (await client.put(f"/api/v1/billing/branding/me/testimonials/{t['id']}", headers=hdr(stranger),
                             json={"author_name": "x", "quote": "y"})).status_code == 404
    public = (await client.get(f"/api/v1/billing/branding/{company}")).json()
    assert public["enabled"] is True
    assert public["testimonials"][0]["quote"] == "Great people"
    assert (await client.get("/api/v1/billing/branding/me", headers=h)).json()["enabled"] is True
    assert (await client.delete(f"/api/v1/billing/branding/me/testimonials/{t['id']}", headers=h)).status_code == 204
    assert (await client.get(f"/api/v1/billing/branding/{uuid.uuid4()}")).status_code == 404
    assert (await client.get("/api/v1/billing/branding/me", headers=hdr(stranger))).status_code == 404


@pytest.mark.asyncio
async def test_branding_hidden_once_entitlement_ends(client: AsyncClient, billing_on):
    owner = await make_user(UserRole.COMPANY)
    company = await make_company(owner)
    await give(owner.id, "employer_branding", ref="sub_brand")
    await client.put("/api/v1/billing/branding/me", headers=hdr(owner), json={"cover_video_url": "https://v.example/x"})
    async with TestingSessionLocal() as db:
        await grants.revoke_source(db, "sub_brand")
        await db.commit()
    assert (await client.get(f"/api/v1/billing/branding/{company}")).json()["enabled"] is False


# ── composer messaging credits ──────────────────────────────────────────────


async def _conversation(client, a, b) -> str:
    resp = await client.post("/api/v1/conversations", headers=hdr(a), json={"participant_id": str(b.id)})
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _candidate():
    from app.domains.engineers.models import EngineerProfile

    user = await make_user()
    async with TestingSessionLocal() as db:
        db.add(EngineerProfile(user_id=user.id, headline="Writer"))
        await db.commit()
    return user


@pytest.mark.asyncio
async def test_employer_first_message_to_non_connection_spends_a_credit(client: AsyncClient, billing_on):
    employer = await make_user(UserRole.COMPANY)
    await make_company(employer)
    candidate = await _candidate()
    conv = await _conversation(client, employer, candidate)
    quote = (await client.get("/api/v1/billing/messages/quote", headers=hdr(employer),
                              params={"recipient_id": str(candidate.id), "conversation_id": conv})).json()
    assert quote == {"required": True, "available": 0}
    send = lambda u, text: client.post(f"/api/v1/conversations/{conv}/messages",  # noqa: E731
                                       headers=hdr(u), json={"content": text})
    assert (await send(employer, "Hello")).status_code == 402
    await give(employer.id, "messaging_credits", 1)
    assert (await send(employer, "Hello")).status_code == 201
    assert (await send(employer, "Follow-up")).status_code == 201  # conversation is open now: free
    assert (await send(candidate, "Hi!")).status_code == 201
    async with TestingSessionLocal() as db:
        assert len((await db.scalars(select(MessageCreditSpend))).all()) == 1
        assert await grants.balance(db, employer.id, "messaging_credits") == 0


@pytest.mark.asyncio
async def test_connections_members_and_billing_off_are_free(client: AsyncClient, billing_on, monkeypatch):
    from app.domains.network.models import Connection

    employer = await make_user(UserRole.COMPANY)
    await make_company(employer)
    friend, member_a, member_b = await _candidate(), await make_user(), await make_user()
    async with TestingSessionLocal() as db:
        db.add(Connection(sender_id=employer.id, receiver_id=friend.id, status="ACCEPTED"))
        await db.commit()
    conv = await _conversation(client, employer, friend)
    assert (await client.post(f"/api/v1/conversations/{conv}/messages", headers=hdr(employer),
                              json={"content": "hi"})).status_code == 201
    conv2 = await _conversation(client, member_a, member_b)  # neither is an employer
    assert (await client.post(f"/api/v1/conversations/{conv2}/messages", headers=hdr(member_a),
                              json={"content": "hi"})).status_code == 201
    stranger = await _candidate()
    monkeypatch.setattr(settings, "BILLING_ENABLED", False)
    conv3 = await _conversation(client, employer, stranger)
    assert (await client.post(f"/api/v1/conversations/{conv3}/messages", headers=hdr(employer),
                              json={"content": "hi"})).status_code == 201
    quote = (await client.get("/api/v1/billing/messages/quote", headers=hdr(employer),
                              params={"recipient_id": str(stranger.id)})).json()
    assert quote["required"] is False


# ── referral credit retries ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_failed_referral_credit_is_retried_with_backoff(client: AsyncClient, billing_on, fake_stripe, monkeypatch):
    await seed_catalog()
    referrer, friend = await make_user(), await make_user()
    code = (await client.get("/api/v1/billing/referral", headers=hdr(referrer))).json()["code"]
    await client.post("/api/v1/billing/referral/claim", headers=hdr(friend), json={"code": code})
    calls: list[str] = []

    def flaky(customer, **kwargs):
        calls.append(customer)
        if len(calls) == 2:
            raise stripe.APIConnectionError("down")
        return {"id": "cbtxn"}

    monkeypatch.setattr(stripe.Customer, "create_balance_transaction", flaky)
    purchase = await checkout(client, friend, "ai_pack_5")
    await complete(client, purchase, amount_total=500)
    async with TestingSessionLocal() as db:
        ref = await db.scalar(select(Referral))
        assert ref.referrer_credited_at is not None
        assert ref.referred_credited_at is None
        assert ref.attempts == 1
        assert ref.last_error == "APIConnectionError"
        assert ref.rewarded_at is None
        assert await service.retry_referral_credits(db) == {"due": 0, "credited": 0}  # backoff not over
        ref.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
        await db.flush()
        assert await service.retry_referral_credits(db) == {"due": 1, "credited": 1}
        await db.commit()
        assert ref.rewarded_at is not None
        assert ref.referred_credited_at is not None
    assert len(calls) == 3  # referrer once, referred twice: nobody credited twice


@pytest.mark.asyncio
async def test_referral_retries_stop_and_alert_after_max_attempts(billing_on, monkeypatch, fake_stripe):
    from app.services import slack

    alerts: list[str] = []
    monkeypatch.setattr(slack, "notify", lambda channel, text, **k: alerts.append(channel))
    monkeypatch.setattr(settings, "BILLING_REFERRAL_MAX_ATTEMPTS", 2)

    def down(*a, **k):
        raise stripe.APIConnectionError("down")

    monkeypatch.setattr(stripe.Customer, "create_balance_transaction", down)
    a, b = await make_user(), await make_user()
    async with TestingSessionLocal() as db:
        ref = Referral(referrer_id=a.id, referred_id=b.id, qualified_at=datetime.now(UTC),
                       next_attempt_at=datetime.now(UTC))
        db.add(ref)
        await db.flush()
        for _ in range(3):
            ref.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
            await db.flush()
            await service.retry_referral_credits(db)
        assert ref.attempts == 2
        assert alerts == ["errors"]
        assert service._backoff_minutes(20) == 24 * 60


@pytest.mark.asyncio
async def test_worker_tasks_skip_while_billing_is_off():
    from app.worker import tasks

    assert await tasks.retry_referral_credits_async() == {"skipped": True}
    assert await tasks.refund_unanswered_messages_async() == {"skipped": True}


@pytest.mark.asyncio
async def test_worker_tasks_run_when_billing_is_on(billing_on, monkeypatch):
    from conftest import TestingSessionLocal

    from app.worker import runtime, tasks

    monkeypatch.setattr(runtime, "session_factory", lambda: TestingSessionLocal)
    assert await tasks.retry_referral_credits_async() == {"due": 0, "credited": 0}
    assert await tasks.refund_unanswered_messages_async() == {"refunded": 0, "replied": 0}


# ── open to opportunities is opt-in ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_new_profiles_are_not_open_to_opportunities_by_default(client: AsyncClient):
    member = await make_user()
    created = await client.post("/api/v1/engineers/me", headers=hdr(member), json={"headline": "Designer"})
    assert created.status_code == 201
    assert created.json()["is_open_to_work"] is False
    # Still listed in the member directory: the opt-in only governs candidate search and matching.
    listed = (await client.get("/api/v1/engineers")).json()
    assert created.json()["id"] in [p["id"] for p in listed]
