"""Provider-independent notification delivery — persists to DB and pushes via WebSocket."""

from typing import Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ws_manager import ws_manager
from app.domains.notifications.models import Notification
from app.services.email.outbox import enqueue_email, render_email


class NotificationProvider(Protocol):
    async def send(self, user_id: UUID, title: str, body: str, kind: str) -> None: ...


class InAppNotificationProvider:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def send(self, user_id: UUID, title: str, body: str, kind: str) -> None:
        notification = Notification(user_id=user_id, title=title, body=body, kind=kind)
        self.db.add(notification)
        await self.db.flush()

        # Push real-time over WebSocket to any active connections
        payload = {
            "type": "notification",
            "id": str(notification.id),
            "title": title,
            "body": body,
            "kind": kind,
            "is_read": False,
        }
        await ws_manager.send_to_user(user_id, payload)


async def notify_user(
    db: AsyncSession,
    user_id: UUID,
    title: str,
    body: str,
    kind: str,
    email_event_key: str | None = None,
    email_link: str | None = None,
) -> None:
    """In-app notification, plus an email when the call site opts in with a
    stable `email_event_key` (MAIL-01). The email is a durable outbox row in
    the caller's transaction, delivered by app.services.email.outbox; most
    notifications (a like, a new match) are in-app only."""
    from app.domains.notifications.preferences import decide, queue_digest

    decision = await decide(db, user_id, kind, title, body)
    if decision.duplicate:
        return  # same event for the same user within the dedup window
    if decision.in_app:
        await InAppNotificationProvider(db).send(user_id, title, body, kind)
    if email_event_key is None:
        return
    # Push only for email-worthy events (never for likes and other minor activity).
    if decision.push:
        from app.domains.notifications.push import queue_push

        await queue_push(db, user_id, title, body, email_link, dedup_key=email_event_key)
    if decision.email == "off":
        return
    if decision.email == "digest":
        await queue_digest(db, user_id, kind, title, body, email_link)
        return
    await enqueue_email(db, user_id, email_event_key, kind, title, render_email(title, body, email_link))
