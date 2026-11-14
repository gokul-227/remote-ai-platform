"""Notification preferences, deduplication and digest batching."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from conftest import TestingSessionLocal
from httpx import AsyncClient
from sqlalchemy import select

from app.domains.auth.models import User, UserRole
from app.domains.notifications.models import (
    EmailOutbox,
    Notification,
    NotificationDigestItem,
    NotificationPreference,
)
from app.domains.notifications.preferences import build_digests, category_of
from app.services.notifications.service import notify_user


@pytest.fixture(autouse=True)
def email_on(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "resend")
    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")


async def _user(email: str) -> User:
    async with TestingSessionLocal() as db:
        u = User(email=email, full_name="N", role=UserRole.ENGINEER, auth_subject=str(uuid.uuid4()))
        db.add(u)
        await db.commit()
        await db.refresh(u)
        return u


def test_category_mapping():
    assert category_of("application_update") == "application"
    assert category_of("contract_offer") == "contract"
    assert category_of("organisation_invite") == "organisation"
    assert category_of("weird") == "system"


@pytest.mark.asyncio
async def test_defaults_in_app_and_immediate_email_with_dedup():
    u = await _user("dedup@example.com")
    async with TestingSessionLocal() as db:
        for _ in range(3):
            await notify_user(
                db,
                u.id,
                "Hello",
                "Same body",
                "application_update",
                email_event_key=f"k:{uuid.uuid4()}",
            )
        await db.commit()
        notes = (
            (await db.execute(select(Notification).where(Notification.user_id == u.id)))
            .scalars()
            .all()
        )
        emails = (
            (await db.execute(select(EmailOutbox).where(EmailOutbox.user_id == u.id)))
            .scalars()
            .all()
        )
        assert len(notes) == 1
        assert len(emails) == 1


@pytest.mark.asyncio
async def test_preferences_switch_email_to_digest_or_off_and_in_app_off():
    u = await _user("digest@example.com")
    async with TestingSessionLocal() as db:
        db.add(
            NotificationPreference(
                user_id=u.id,
                categories={
                    "application": {"in_app": True, "email": "digest"},
                    "message": {"in_app": False, "email": "off"},
                },
                digest_minutes=15,
            )
        )
        await db.commit()
    async with TestingSessionLocal() as db:
        await notify_user(
            db,
            u.id,
            "App 1",
            "b1",
            "application_update",
            email_event_key="a1",
            email_link="#applications",
        )
        await notify_user(db, u.id, "App 2", "b2", "application_submitted", email_event_key="a2")
        await notify_user(db, u.id, "Msg", "m", "message_sent", email_event_key="m1")
        await db.commit()
        notes = (
            (await db.execute(select(Notification).where(Notification.user_id == u.id)))
            .scalars()
            .all()
        )
        assert sorted(n.title for n in notes) == ["App 1", "App 2"]  # message in-app is off
        assert (
            await db.execute(select(EmailOutbox).where(EmailOutbox.user_id == u.id))
        ).scalars().all() == []
        items = (
            (
                await db.execute(
                    select(NotificationDigestItem).where(NotificationDigestItem.user_id == u.id)
                )
            )
            .scalars()
            .all()
        )
        assert len(items) == 2
        # Too early: nothing sent.
        assert await build_digests(db, now=datetime.now(UTC)) == {"emails": 0, "items": 0}
        result = await build_digests(db, now=datetime.now(UTC) + timedelta(minutes=16))
        assert result == {"emails": 1, "items": 2}
        emails = (
            (await db.execute(select(EmailOutbox).where(EmailOutbox.user_id == u.id)))
            .scalars()
            .all()
        )
        assert len(emails) == 1
        assert "2 new notifications" in emails[0].html
        assert "App 1" in emails[0].html
        # Already sent items are not sent twice.
        assert await build_digests(db, now=datetime.now(UTC) + timedelta(minutes=40)) == {
            "emails": 0,
            "items": 0,
        }


@pytest.mark.asyncio
async def test_preferences_endpoints(client: AsyncClient, engineer_token: str):
    h = {"Authorization": f"Bearer {engineer_token}"}
    current = await client.get("/api/v1/notifications/preferences", headers=h)
    assert current.status_code == 200
    assert current.json()["configured"] is False
    assert current.json()["categories"]["application"] == {"in_app": True, "email": "immediate"}
    bad = await client.put(
        "/api/v1/notifications/preferences",
        headers=h,
        json={"categories": {"nonsense": {"email": "off"}}},
    )
    assert bad.status_code == 422
    bad2 = await client.put(
        "/api/v1/notifications/preferences",
        headers=h,
        json={"categories": {"message": {"email": "weekly"}}},
    )
    assert bad2.status_code == 422
    ok = await client.put(
        "/api/v1/notifications/preferences",
        headers=h,
        json={"categories": {"message": {"in_app": True, "email": "digest"}}, "digest_minutes": 60},
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["categories"]["message"] == {"in_app": True, "email": "digest"}
    assert body["categories"]["system"] == {"in_app": True, "email": "immediate"}
    assert body["digest_minutes"] == 60


@pytest.mark.asyncio
async def test_disabled_email_preserves_digest_for_recovery(monkeypatch):
    from app.core.config import settings

    u = await _user("recover-digest@example.com")
    async with TestingSessionLocal() as db:
        item = NotificationDigestItem(
            user_id=u.id,
            kind="message",
            title="<b>Untrusted</b>",
            body="Still pending",
            created_at=datetime.now(UTC) - timedelta(hours=1),
        )
        db.add(item)
        await db.commit()
        monkeypatch.setattr(settings, "EMAIL_PROVIDER", "none")
        assert await build_digests(db) == {"emails": 0, "items": 0}
        await db.refresh(item)
        assert item.sent_at is None
        monkeypatch.setattr(settings, "EMAIL_PROVIDER", "resend")
        assert await build_digests(db) == {"emails": 1, "items": 1}
        mail = await db.scalar(select(EmailOutbox).where(EmailOutbox.user_id == u.id))
        assert "&lt;b&gt;Untrusted&lt;/b&gt;" in mail.html
        assert "&lt;ul&gt;" not in mail.html
