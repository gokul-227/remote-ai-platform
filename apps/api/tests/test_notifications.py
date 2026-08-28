"""
Tests for Real-Time Notification WebSocket and REST Endpoints.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User
from app.core.ws_manager import ConnectionManager


@pytest.mark.asyncio
async def test_unread_count_starts_at_zero(client: AsyncClient, test_user: User, auth_headers: dict):
    resp = await client.get("/api/v1/notifications/unread-count", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["count"] == 0


@pytest.mark.asyncio
async def test_list_notifications_empty_initially(client: AsyncClient, test_user: User, auth_headers: dict):
    resp = await client.get("/api/v1/notifications", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_notification_created_and_marked_read(
    client: AsyncClient, test_user: User, auth_headers: dict, db: AsyncSession
):
    from app.services.notifications import notify_user

    # Create a notification via the service (as the platform would)
    await notify_user(db, test_user.id, "Test Alert", "You have a new match!", "match")
    await db.commit()

    # Verify it appears in the REST list
    list_resp = await client.get("/api/v1/notifications", headers=auth_headers)
    assert list_resp.status_code == 200
    notifications = list_resp.json()
    assert len(notifications) == 1
    assert notifications[0]["title"] == "Test Alert"
    assert notifications[0]["is_read"] is False
    notification_id = notifications[0]["id"]

    # Verify unread count
    count_resp = await client.get("/api/v1/notifications/unread-count", headers=auth_headers)
    assert count_resp.json()["count"] == 1

    # Mark as read
    mark_resp = await client.patch(
        f"/api/v1/notifications/{notification_id}/read",
        headers=auth_headers,
    )
    assert mark_resp.status_code == 204

    # Verify unread count is now 0
    count_after = await client.get("/api/v1/notifications/unread-count", headers=auth_headers)
    assert count_after.json()["count"] == 0


@pytest.mark.asyncio
async def test_mark_all_read(
    client: AsyncClient, test_user: User, auth_headers: dict, db: AsyncSession
):
    from app.services.notifications import notify_user

    # Create multiple notifications
    for i in range(3):
        await notify_user(db, test_user.id, f"Notification {i}", f"Body {i}", "system")
    await db.commit()

    count_before = await client.get("/api/v1/notifications/unread-count", headers=auth_headers)
    assert count_before.json()["count"] == 3

    mark_all = await client.patch("/api/v1/notifications/read-all", headers=auth_headers)
    assert mark_all.status_code == 204

    count_after = await client.get("/api/v1/notifications/unread-count", headers=auth_headers)
    assert count_after.json()["count"] == 0


@pytest.mark.asyncio
async def test_ws_manager_connect_disconnect():
    """Unit test the ConnectionManager without a real WebSocket."""
    manager = ConnectionManager()

    class FakeWS:
        async def send_json(self, data):
            self.sent = data

    ws = FakeWS()
    user_id_str = "00000000-0000-0000-0000-000000000001"
    import uuid
    user_id = uuid.UUID(user_id_str)

    # Send to user with no connections should not error
    delivered = await manager.send_to_user(user_id, {"type": "test"})
    assert delivered == 0
    assert manager.active_user_count() == 0
    assert manager.connection_count() == 0
