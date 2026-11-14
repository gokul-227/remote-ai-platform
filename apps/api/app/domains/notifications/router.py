"""
Notifications Router — REST endpoints + WebSocket real-time delivery.
"""

import uuid

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionFactory, get_db
from app.core.feature_flags import is_feature_enabled
from app.core.ws_manager import ws_manager
from app.domains.auth.dependencies import authenticate_bearer_token, get_current_user
from app.domains.auth.models import User
from app.domains.notifications.models import (
    NOTIFICATION_CATEGORIES,
    Notification,
    NotificationPreference,
)
from app.domains.notifications.preferences import normalise

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


class CategoryPrefIn(BaseModel):
    push: bool = True
    in_app: bool = True
    email: str = Field(default="immediate", pattern="^(immediate|digest|off)$")


class PreferencesIn(BaseModel):
    categories: dict[str, CategoryPrefIn] = {}
    digest_minutes: int = Field(default=15, ge=5, le=1440)


@router.get("/preferences", summary="Notification preferences")
async def get_preferences(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    pref = await db.get(NotificationPreference, current_user.id)
    return {
        "categories": normalise(pref.categories if pref else None),
        "digest_minutes": pref.digest_minutes if pref else 15,
        "configured": pref is not None,
    }


@router.put("/preferences", summary="Update notification preferences")
async def put_preferences(
    body: PreferencesIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    unknown = set(body.categories) - set(NOTIFICATION_CATEGORIES)
    if unknown:
        raise HTTPException(
            status_code=422, detail=f"Unknown categories: {', '.join(sorted(unknown))}"
        )
    pref = await db.get(NotificationPreference, current_user.id)
    if pref is None:
        pref = NotificationPreference(user_id=current_user.id, categories={})
        db.add(pref)
    pref.categories = normalise({k: v.model_dump() for k, v in body.categories.items()})
    pref.digest_minutes = body.digest_minutes
    await db.flush()
    return {
        "categories": pref.categories,
        "digest_minutes": pref.digest_minutes,
        "configured": True,
    }


class PushSubscribeIn(BaseModel):
    token: str = Field(min_length=20, max_length=512)
    platform: str = Field(default="web", pattern="^(web|android|ios)$")


@router.get("/push/config", summary="Browser push configuration (public values only)")
async def push_config(current_user: User = Depends(get_current_user)) -> dict:
    from app.core.config import settings
    from app.domains.notifications.push import push_enabled

    return {
        "enabled": push_enabled(),
        "vapid_key": settings.FCM_VAPID_KEY if push_enabled() else None,
    }


@router.post(
    "/push/subscriptions",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Register this device for push",
)
async def push_subscribe(
    body: PushSubscribeIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    from datetime import UTC, datetime

    from app.domains.notifications.models import PushSubscription

    existing = await db.scalar(select(PushSubscription).where(PushSubscription.token == body.token))
    agent = (request.headers.get("user-agent") or "")[:255]
    if existing is None:
        db.add(
            PushSubscription(
                user_id=current_user.id, token=body.token, platform=body.platform, user_agent=agent
            )
        )
    else:
        # A token moves to whoever signed in on that browser last.
        existing.user_id = current_user.id
        existing.revoked_at = None
        existing.last_seen_at = datetime.now(UTC)
        existing.user_agent = agent
    await db.flush()


@router.delete(
    "/push/subscriptions", status_code=status.HTTP_204_NO_CONTENT, summary="Unregister this device"
)
async def push_unsubscribe(
    body: PushSubscribeIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    from datetime import UTC, datetime

    from app.domains.notifications.models import PushSubscription

    existing = await db.scalar(
        select(PushSubscription).where(
            PushSubscription.token == body.token, PushSubscription.user_id == current_user.id
        )
    )
    if existing is not None:
        existing.revoked_at = datetime.now(UTC)
        await db.flush()


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
async def notification_websocket(
    websocket: WebSocket, user_id: uuid.UUID, token: str = Query(...)
) -> None:
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
    if not is_feature_enabled("realtime_websockets"):
        await websocket.close(code=1008)  # policy: realtime is off; clients poll
        return
    async with AsyncSessionFactory() as db:
        try:
            # Same Supabase token verification as HTTP requests.
            user = await authenticate_bearer_token(token, db)
            if user.id != user_id:
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
