"""
Notifications Router — REST endpoints + WebSocket real-time delivery.
"""

import uuid

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionFactory, get_db
from app.core.ws_manager import ws_manager
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.auth.repository import UserRepository
from app.domains.auth.service import AuthService
from app.domains.notifications.models import Notification

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ─── REST Endpoints ─────────────────────────────────────────────────────────


@router.get("", summary="List notifications for current user")
async def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    unread_only: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    stmt = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    notifications = result.scalars().all()
    return [
        {
            "id": str(n.id),
            "title": n.title,
            "body": n.body,
            "kind": n.kind,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat(),
        }
        for n in notifications
    ]


@router.get("/unread-count", summary="Count unread notifications")
async def unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    count = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
    )
    return {"count": count or 0}


@router.patch("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await db.execute(
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .values(is_read=True)
    )
    return None


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True)
    )
    return None


# ─── WebSocket Real-Time Delivery ─────────────────────────────────────────


@router.websocket("/ws/{user_id}")
async def notification_websocket(websocket: WebSocket, user_id: uuid.UUID, token: str = Query(...)) -> None:
    """
    WebSocket endpoint for real-time notification delivery.

    On connection, the server immediately sends all unread notification count.
    Subsequent notifications are pushed as they are created via notify_user().

    Protocol (server → client):
      {"type": "ping"}                         — keepalive
      {"type": "unread_count", "count": N}     — sent on connect
      {"type": "notification", ...fields}      — new notification pushed

    The frontend passes ?token= as a query param. The token's owner must match
    `user_id` — a caller cannot subscribe to another user's notification stream.
    """
    async with AsyncSessionFactory() as db:
        try:
            service = AuthService(UserRepository(db))
            token_payload = await service.verify_token(token)
            user = await db.scalar(select(User).where(User.keycloak_id == token_payload.sub))
            if not user and token_payload.email:
                user = await db.scalar(select(User).where(User.email == token_payload.email))
            if not user or user.id != user_id:
                await websocket.close(code=4401)
                return
        except Exception:
            await websocket.close(code=4401)
            return

    await ws_manager.connect(websocket, user_id)
    try:
        # Send a welcome ping on connection
        await websocket.send_json({"type": "ping", "status": "connected"})
        while True:
            # Wait for any client message (keepalive / read receipts)
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(websocket, user_id)


# ─── Utility: push notification and persist in DB ───────────────────────


async def notify_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    title: str,
    body: str,
    kind: str = "system",
) -> Notification:
    """
    Persist a notification and push it in real-time to all active WebSocket connections.
    Falls back gracefully when user has no active connections.
    """
    notification = Notification(
        user_id=user_id,
        title=title,
        body=body,
        kind=kind,
    )
    db.add(notification)
    await db.flush()

    # Push in real-time to any active connections
    payload = {
        "type": "notification",
        "id": str(notification.id),
        "title": title,
        "body": body,
        "kind": kind,
        "is_read": False,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }
    await ws_manager.send_to_user(user_id, payload)

    return notification
