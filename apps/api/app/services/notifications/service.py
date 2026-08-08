"""Provider-independent notification delivery boundaries."""

from typing import Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.notifications.models import Notification


class NotificationProvider(Protocol):
    async def send(self, user_id: UUID, title: str, body: str, kind: str) -> None: ...


class InAppNotificationProvider:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def send(self, user_id: UUID, title: str, body: str, kind: str) -> None:
        self.db.add(Notification(user_id=user_id, title=title, body=body, kind=kind))


class EmailNotificationProvider:
    """Future email adapter boundary; deliberately does not send external mail."""

    async def send(self, user_id: UUID, title: str, body: str, kind: str) -> None:
        return None


async def notify_user(db: AsyncSession, user_id: UUID, title: str, body: str, kind: str) -> None:
    await InAppNotificationProvider(db).send(user_id, title, body, kind)
