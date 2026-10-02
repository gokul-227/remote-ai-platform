"""Durable email delivery (MAIL-01).

`enqueue_email` adds an intent to `email_outbox` inside the caller's
transaction, so the email exists exactly when the business change commits.
`dispatch_due` leases a bounded batch of due rows, sends them, and records
SENT, a retry with exponential backoff and jitter, or DEAD after the last
attempt. A crashed dispatcher's lease expires and the row is picked up again;
the provider idempotency key (the row's `event_key`) keeps that retry from
delivering twice.

Only transactional messages about the user's own activity are sent; there is
no marketing email. Nothing is enqueued while EMAIL_PROVIDER is "none".
"""

import asyncio
import html as html_lib
import random
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.domains.auth.models import User
from app.domains.notifications.models import EmailOutbox
from app.services.email.service import get_email_provider

logger = get_logger("services.email.outbox")

MAX_ATTEMPTS = 6
LEASE = timedelta(minutes=5)
BASE_BACKOFF_SECONDS = 60
MAX_BACKOFF_SECONDS = 6 * 3600


def email_enabled() -> bool:
    return settings.EMAIL_PROVIDER != "none"


def render_email(title: str, body: str, link_path: str | None = None) -> str:
    """A minimal, escaped HTML message. Titles and bodies contain other users'
    text (job titles, names), so everything is escaped."""
    parts = [
        f"<h2 style=\"font-family:sans-serif\">{html_lib.escape(title)}</h2>",
        f"<p style=\"font-family:sans-serif\">{html_lib.escape(body)}</p>",
    ]
    if link_path and settings.FRONTEND_URL:
        url = f"{settings.FRONTEND_URL.rstrip('/')}/{link_path.lstrip('/')}"
        parts.append(f"<p style=\"font-family:sans-serif\"><a href=\"{html_lib.escape(url)}\">Open Remote AI Platform</a></p>")
    parts.append(
        "<p style=\"font-family:sans-serif;color:#666;font-size:12px\">You receive this because of activity on "
        "your Remote AI Platform account.</p>"
    )
    return "\n".join(parts)


async def enqueue_email(
    db: AsyncSession, user_id: uuid.UUID, event_key: str, kind: str, subject: str, html: str
) -> bool:
    """Add an email intent in the caller's transaction. Returns False when
    email is disabled or this event was already enqueued (idempotent)."""
    if not email_enabled():
        return False
    # ON CONFLICT DO NOTHING: a duplicate event (retry, concurrent request) is
    # a no-op instead of an error that would abort the caller's transaction.
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert  # type: ignore[assignment]
    stmt = (
        insert(EmailOutbox)
        .values(id=uuid.uuid4(), event_key=event_key, user_id=user_id, kind=kind, subject=subject[:255], html=html)
        .on_conflict_do_nothing(index_elements=["event_key"])
    )
    result = await db.execute(stmt)
    if not result.rowcount:  # type: ignore[attr-defined]
        return False
    return True


def _backoff(attempts: int) -> timedelta:
    seconds = min(BASE_BACKOFF_SECONDS * 2 ** max(attempts - 1, 0), MAX_BACKOFF_SECONDS)
    return timedelta(seconds=seconds * random.uniform(0.8, 1.2))  # noqa: S311 - jitter, not security


async def _lease(db: AsyncSession, limit: int) -> list[EmailOutbox]:
    now = datetime.now(UTC)
    stmt = (
        select(EmailOutbox)
        .where(
            EmailOutbox.status == "PENDING",
            EmailOutbox.next_attempt_at <= now,
            or_(EmailOutbox.locked_until.is_(None), EmailOutbox.locked_until < now),
        )
        .order_by(EmailOutbox.next_attempt_at, EmailOutbox.id)
        .limit(limit)
    )
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update(skip_locked=True)
    rows = list((await db.execute(stmt)).scalars().all())
    for row in rows:
        row.locked_until = now + LEASE
        row.attempts += 1
    await db.commit()
    return rows


async def dispatch_due(db: AsyncSession, limit: int = 20) -> dict[str, int]:
    """Send up to `limit` due emails. Safe to run concurrently and repeatedly."""
    counts = {"sent": 0, "retry": 0, "dead": 0, "cancelled": 0}
    if not email_enabled():
        return counts
    provider = get_email_provider()
    for row in await _lease(db, limit):
        email = await db.scalar(select(User.email).where(User.id == row.user_id, User.is_active.is_(True)))
        if not email:
            row.status, row.last_error = "CANCELLED", "no active recipient"
            counts["cancelled"] += 1
        else:
            result = await provider.send_email(email, row.subject, row.html, idempotency_key=row.event_key)
            if result.sent:
                row.status, row.sent_at = "SENT", datetime.now(UTC)
                row.provider_message_id = (result.provider_message_id or "")[:100] or None
                row.last_error = None
                counts["sent"] += 1
            elif not result.retryable or row.attempts >= MAX_ATTEMPTS:
                row.status, row.last_error = "DEAD", (result.error or "failed")[:100]
                counts["dead"] += 1
                logger.error("Email delivery gave up", kind=row.kind, attempts=row.attempts, error=row.last_error)
            else:
                row.last_error = (result.error or "failed")[:100]
                row.next_attempt_at = datetime.now(UTC) + _backoff(row.attempts)
                counts["retry"] += 1
        row.locked_until = None
        await db.commit()
    return counts


DISPATCH_INTERVAL_SECONDS = 60


async def run_dispatcher(session_factory, interval: float = DISPATCH_INTERVAL_SECONDS) -> None:  # noqa: ANN001
    """Background loop started with the app while email is enabled. The free
    API sleeps when idle, but every enqueue happens during a request, which
    wakes it; the scheduled job-sync workflow also drains the outbox."""
    while True:
        try:
            async with session_factory() as db:
                counts = await dispatch_due(db)
            if any(counts.values()):
                logger.info("Email outbox dispatched", **counts)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # never let the loop die
            logger.error("Email outbox dispatch failed", error=type(e).__name__)
        await asyncio.sleep(interval)
