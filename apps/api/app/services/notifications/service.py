"""Provider-independent notification delivery — persists to DB and pushes via WebSocket."""

from typing import Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ws_manager import ws_manager
from app.domains.auth.models import User
from app.domains.notifications.models import Notification
from app.services.email import get_email_provider


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


class EmailNotificationProvider:
    """Only sends when a call site explicitly opts in with email_html (see
    notify_user) -- most in-app notifications (a like, a new match) aren't
    worth an email; the ones that are (application status change, an org
    invite) pass email_html deliberately, one call site at a time."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def send(self, user_id: UUID, subject: str, html: str) -> None:
        user = await self.db.scalar(select(User).where(User.id == user_id))
        if not user or not user.email:
            return
        await get_email_provider().send_email(to=user.email, subject=subject, html=html)


async def notify_user(
    db: AsyncSession,
    user_id: UUID,
    title: str,
    body: str,
    kind: str,
    email_html: str | None = None,
) -> None:
    await InAppNotificationProvider(db).send(user_id, title, body, kind)
    if email_html is not None:
        await EmailNotificationProvider(db).send(user_id, subject=title, html=email_html)
