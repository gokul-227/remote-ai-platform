"""MAIL-01: email intents are durable, idempotent, retried with backoff, and
never claimed as delivered before the provider accepted them."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.domains.notifications.models import EmailOutbox
from app.services.email import outbox
from app.services.email.service import EmailResult


@pytest.fixture
def email_on(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "resend")
    provider = AsyncMock()
    provider.send_email = AsyncMock(return_value=EmailResult(sent=True, provider_message_id="msg_1"))
    monkeypatch.setattr(outbox, "get_email_provider", lambda: provider)
    return provider


async def _user(db, active=True):
    from app.domains.auth.models import User, UserRole

    user = User(email=f"o-{uuid.uuid4().hex[:8]}@example.com", full_name="O", role=UserRole.ENGINEER, is_active=active)
    db.add(user)
    await db.flush()
    return user


async def _rows(db):
    return (await db.execute(select(EmailOutbox))).scalars().all()


@pytest.mark.asyncio
async def test_nothing_is_enqueued_while_email_is_disabled(monkeypatch):
    from conftest import TestingSessionLocal

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "none")
    async with TestingSessionLocal() as db:
        user = await _user(db)
        assert await outbox.enqueue_email(db, user.id, "k1", "x", "S", "<p>b</p>") is False
        await db.commit()
        assert await _rows(db) == []


@pytest.mark.asyncio
async def test_enqueue_is_idempotent_and_rolls_back_with_the_transaction(email_on):
    from conftest import TestingSessionLocal

    async with TestingSessionLocal() as db:
        user = await _user(db)
        await db.commit()
        assert await outbox.enqueue_email(db, user.id, "same", "x", "S", "h") is True
        assert await outbox.enqueue_email(db, user.id, "same", "x", "S", "h") is False
        await db.commit()
        await outbox.enqueue_email(db, user.id, "rolled-back", "x", "S", "h")
        await db.rollback()
        keys = {r.event_key for r in await _rows(db)}
        assert keys == {"same"}


@pytest.mark.asyncio
async def test_dispatch_sends_with_idempotency_key_and_marks_sent(email_on):
    from conftest import TestingSessionLocal

    async with TestingSessionLocal() as db:
        user = await _user(db)
        await outbox.enqueue_email(db, user.id, "evt-1", "x", "Subject", "<p>b</p>")
        await db.commit()
        counts = await outbox.dispatch_due(db)
        assert counts["sent"] == 1
        email_on.send_email.assert_awaited_once_with(user.email, "Subject", "<p>b</p>", idempotency_key="evt-1")
        (row,) = await _rows(db)
        assert row.status == "SENT"
        assert row.sent_at is not None
        assert row.provider_message_id == "msg_1"
        # Sent rows are never sent again.
        assert (await outbox.dispatch_due(db))["sent"] == 0


@pytest.mark.asyncio
async def test_retryable_failure_backs_off_then_gives_up(email_on):
    from conftest import TestingSessionLocal

    email_on.send_email.return_value = EmailResult(sent=False, error="HTTP 503")
    async with TestingSessionLocal() as db:
        user = await _user(db)
        await outbox.enqueue_email(db, user.id, "evt-r", "x", "S", "h")
        await db.commit()
        assert (await outbox.dispatch_due(db))["retry"] == 1
        (row,) = await _rows(db)
        assert row.status == "PENDING"
        assert row.attempts == 1
        assert row.last_error == "HTTP 503"
        next_at = row.next_attempt_at if row.next_attempt_at.tzinfo else row.next_attempt_at.replace(tzinfo=UTC)
        assert next_at > datetime.now(UTC) + timedelta(seconds=30)
        # Not due yet: nothing happens.
        assert (await outbox.dispatch_due(db))["retry"] == 0
        # Last attempt: dead-lettered, visible for intervention.
        row.attempts = outbox.MAX_ATTEMPTS - 1
        row.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
        await db.commit()
        assert (await outbox.dispatch_due(db))["dead"] == 1
        assert (await _rows(db))[0].status == "DEAD"


@pytest.mark.asyncio
async def test_rejected_message_is_dead_at_once(email_on):
    from conftest import TestingSessionLocal

    email_on.send_email.return_value = EmailResult(sent=False, error="HTTP 422", retryable=False)
    async with TestingSessionLocal() as db:
        user = await _user(db)
        await outbox.enqueue_email(db, user.id, "evt-d", "x", "S", "h")
        await db.commit()
        assert (await outbox.dispatch_due(db))["dead"] == 1


@pytest.mark.asyncio
async def test_inactive_recipient_is_cancelled_not_sent(email_on):
    from conftest import TestingSessionLocal

    async with TestingSessionLocal() as db:
        user = await _user(db, active=False)
        await outbox.enqueue_email(db, user.id, "evt-c", "x", "S", "h")
        await db.commit()
        assert (await outbox.dispatch_due(db))["cancelled"] == 1
        email_on.send_email.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_live_lease_is_skipped_and_an_expired_one_is_resumed(email_on):
    from conftest import TestingSessionLocal

    async with TestingSessionLocal() as db:
        user = await _user(db)
        await outbox.enqueue_email(db, user.id, "evt-l", "x", "S", "h")
        await db.commit()
        (row,) = await _rows(db)
        row.locked_until = datetime.now(UTC) + timedelta(minutes=4)  # another dispatcher holds it
        await db.commit()
        assert (await outbox.dispatch_due(db))["sent"] == 0
        row.locked_until = datetime.now(UTC) - timedelta(seconds=1)  # that dispatcher crashed
        await db.commit()
        assert (await outbox.dispatch_due(db))["sent"] == 1


def test_rendered_email_escapes_user_text(monkeypatch):
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://remoteaiplatform.com")
    html = outbox.render_email("<script>x</script>", 'Job "A&B"', "#applications")
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "A&amp;B" in html
    assert 'href="https://remoteaiplatform.com/#applications"' in html


@pytest.mark.asyncio
async def test_notify_user_enqueues_only_when_asked(email_on):
    from conftest import TestingSessionLocal

    from app.services.notifications.service import notify_user

    async with TestingSessionLocal() as db:
        user = await _user(db)
        await notify_user(db, user.id, "In-app only", "b", "generic")
        await notify_user(db, user.id, "Application updated", "b", "application_update", email_event_key="e-1")
        await db.commit()
        rows = await _rows(db)
        assert [r.subject for r in rows] == ["Application updated"]
        assert await db.scalar(select(func.count()).select_from(EmailOutbox)) == 1
