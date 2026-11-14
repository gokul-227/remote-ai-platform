"""Notification preferences, deduplication and digest batching.

`decide(db, user_id, kind)` tells `notify_user` what to do for one event:
whether to store an in-app notification, and whether email goes out now, into
the digest queue, or not at all. Defaults keep today's behaviour (in-app on,
email immediate for call sites that opt in).
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.notifications.models import (
    EMAIL_MODES,
    NOTIFICATION_CATEGORIES,
    Notification,
    NotificationDigestItem,
    NotificationPreference,
)

DEDUP_WINDOW = timedelta(minutes=10)
DEFAULT_CATEGORY: dict[str, Any] = {"in_app": True, "email": "immediate"}


def category_of(kind: str) -> str:
    head = (kind or "system").split("_", 1)[0].split(".", 1)[0].lower()
    return head if head in NOTIFICATION_CATEGORIES else "system"


def normalise(categories: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    """Fill every category with validated values."""
    out: dict[str, dict[str, Any]] = {}
    for cat in NOTIFICATION_CATEGORIES:
        raw = (categories or {}).get(cat) or {}
        email = raw.get("email", DEFAULT_CATEGORY["email"])
        out[cat] = {
            "in_app": bool(raw.get("in_app", DEFAULT_CATEGORY["in_app"])),
            "email": email if email in EMAIL_MODES else DEFAULT_CATEGORY["email"],
        }
    return out


@dataclass(frozen=True)
class Decision:
    in_app: bool
    email: str  # immediate | digest | off
    duplicate: bool


async def decide(
    db: AsyncSession, user_id: uuid.UUID, kind: str, title: str, body: str
) -> Decision:
    pref = await db.get(NotificationPreference, user_id)
    cat = normalise(pref.categories if pref else None)[category_of(kind)]
    since = datetime.now(UTC) - DEDUP_WINDOW
    dup = await db.scalar(
        select(Notification.id)
        .where(
            Notification.user_id == user_id,
            Notification.kind == kind,
            Notification.title == title,
            Notification.body == body,
            Notification.created_at >= since,
        )
        .limit(1)
    )
    return Decision(in_app=cat["in_app"], email=cat["email"], duplicate=dup is not None)


async def queue_digest(
    db: AsyncSession, user_id: uuid.UUID, kind: str, title: str, body: str, link_path: str | None
) -> None:
    db.add(
        NotificationDigestItem(
            user_id=user_id, kind=kind, title=title, body=body, link_path=link_path
        )
    )
    await db.flush()


async def build_digests(
    db: AsyncSession, now: datetime | None = None, limit_users: int = 200
) -> dict[str, int]:
    """Bundle unsent digest items per user into one email each. Returns counts. Commits.

    A user's items are sent when the oldest is older than their digest window.
    """
    from app.services.email.outbox import enqueue_email, render_email

    now = now or datetime.now(UTC)
    rows = (
        (
            await db.execute(
                select(NotificationDigestItem)
                .where(NotificationDigestItem.sent_at.is_(None))
                .order_by(NotificationDigestItem.user_id, NotificationDigestItem.created_at)
            )
        )
        .scalars()
        .all()
    )
    by_user: dict[uuid.UUID, list[NotificationDigestItem]] = {}
    for item in rows:
        by_user.setdefault(item.user_id, []).append(item)
    emails = 0
    items_sent = 0
    for user_id, items in list(by_user.items())[:limit_users]:
        pref = await db.get(NotificationPreference, user_id)
        window = timedelta(minutes=pref.digest_minutes if pref else 15)
        oldest = items[0].created_at
        if oldest.tzinfo is None:
            oldest = oldest.replace(tzinfo=UTC)
        if now - oldest < window:
            continue
        lines = "".join(f"<li><b>{i.title}</b> — {i.body}</li>" for i in items[:50])
        more = f"<p>…and {len(items) - 50} more.</p>" if len(items) > 50 else ""
        html = render_email(
            f"{len(items)} new notification{'s' if len(items) != 1 else ''}",
            f"<ul>{lines}</ul>{more}",
            "#notifications",
        )
        slot = now.strftime("%Y%m%d%H%M")
        sent = await enqueue_email(
            db,
            user_id,
            f"digest:{user_id}:{slot}",
            "digest",
            f"Your Remote AI Platform digest ({len(items)})",
            html,
        )
        for i in items:
            i.sent_at = now
        items_sent += len(items)
        emails += int(sent)
    await db.commit()
    return {"emails": emails, "items": items_sent}
