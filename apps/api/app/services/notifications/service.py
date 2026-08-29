"""Provider-independent notification delivery — persists to DB and pushes via WebSocket."""

from typing import Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ws_manager import ws_manager
from app.domains.notifications.models import Notification


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
    """Future email adapter boundary; deliberately does not send external mail."""

    async def send(self, user_id: UUID, title: str, body: str, kind: str) -> None:
        return None


async def notify_user(db: AsyncSession, user_id: UUID, title: str, body: str, kind: str) -> None:
    await InAppNotificationProvider(db).send(user_id, title, body, kind)
