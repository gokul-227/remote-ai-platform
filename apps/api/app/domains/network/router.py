import asyncio
import json
import uuid
from collections import defaultdict
from typing import Any

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionFactory, get_db
from app.domains.analytics.service import emit_analytics_event
from app.domains.auth.dependencies import authenticate_bearer_token, get_current_user
from app.domains.auth.models import User
from app.domains.engineers.models import EngineerProfile
from app.domains.network.models import Connection, Conversation, Message
from app.services.notifications import notify_user as send_notification

router = APIRouter(tags=["Network"])


class ConnectionCreate(BaseModel):
    receiver_id: uuid.UUID


class ConnectionStatusUpdate(BaseModel):
    status: str = Field(pattern="^(ACCEPTED|REJECTED|BLOCKED)$")


class ConversationCreate(BaseModel):
    participant_id: uuid.UUID


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=10000)


async def notify(db: AsyncSession, user_id: uuid.UUID, title: str, body: str, kind: str) -> None:
    await send_notification(db, user_id, title, body, kind)


async def user_summaries(db: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, dict[str, Any]]:
    """Public-safe display info for other users (never email), keyed by user id."""
    if not ids:
        return {}
    rows = await db.execute(
        select(User.id, User.full_name, User.avatar_url, User.role, EngineerProfile.id, EngineerProfile.headline)
        .outerjoin(EngineerProfile, EngineerProfile.user_id == User.id)
        .where(User.id.in_(ids))
    )
    return {
        uid: {
            "id": uid,
            "full_name": name,
            "avatar_url": avatar,
            "role": role.value if hasattr(role, "value") else role,
            "engineer_profile_id": profile_id,
            "headline": headline,
        }
        for uid, name, avatar, role, profile_id, headline in rows.all()
    }


def _connection_out(c: Connection, users: dict[uuid.UUID, dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": c.id,
        "sender_id": c.sender_id,
        "receiver_id": c.receiver_id,
        "status": c.status,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
        "sender": users.get(c.sender_id),
        "receiver": users.get(c.receiver_id),
    }


@router.get("/connections")
async def list_connections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status", pattern="^(PENDING|ACCEPTED|REJECTED|BLOCKED)$"),
):
    query = select(Connection).where(
        or_(
            Connection.sender_id == current_user.id,
            Connection.receiver_id == current_user.id,
        )
    )
    if status_filter:
        query = query.where(Connection.status == status_filter)
    result = await db.execute(query.order_by(Connection.created_at.desc()).offset(skip).limit(limit))
    connections = result.scalars().all()
    users = await user_summaries(db, {c.sender_id for c in connections} | {c.receiver_id for c in connections})
    return [_connection_out(c, users) for c in connections]


@router.post("/connections", status_code=status.HTTP_201_CREATED)
async def send_connection(
    data: ConnectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.receiver_id == current_user.id or not await db.get(User, data.receiver_id):
        raise HTTPException(status_code=400, detail="A valid different recipient is required")
    existing = await db.scalar(
        select(Connection).where(
            or_(
                (Connection.sender_id == current_user.id)
                & (Connection.receiver_id == data.receiver_id),
                (Connection.sender_id == data.receiver_id)
                & (Connection.receiver_id == current_user.id),
            )
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Connection already exists")
    connection = Connection(
        sender_id=current_user.id,
        receiver_id=data.receiver_id,
        status="PENDING",
    )
    db.add(connection)
    await notify(
        db,
        data.receiver_id,
        "New connection request",
        f"{current_user.full_name} wants to connect.",
        "connection_request",
    )
    await db.flush()
    return connection


@router.patch("/connections/{connection_id}")
async def update_connection(
    connection_id: uuid.UUID,
    data: ConnectionStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    connection = await db.get(Connection, connection_id)
    if not connection or current_user.id not in (connection.sender_id, connection.receiver_id):
        raise HTTPException(status_code=404, detail="Connection not found")
    if data.status in {"ACCEPTED", "REJECTED"} and current_user.id != connection.receiver_id:
        raise HTTPException(status_code=403, detail="Only the recipient can respond")
    connection.status = data.status
    recipient = (
        connection.sender_id
        if current_user.id == connection.receiver_id
        else connection.receiver_id
    )
    await notify(
        db,
        recipient,
        f"Connection {data.status.lower()}",
        f"{current_user.full_name} updated your connection request.",
        "connection_update",
    )
    await db.flush()
    return connection


@router.delete("/connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_connection(
    connection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    connection = await db.get(Connection, connection_id)
    if not connection or current_user.id not in (connection.sender_id, connection.receiver_id):
        raise HTTPException(status_code=404, detail="Connection not found")
    await db.delete(connection)


@router.get("/conversations")
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    result = await db.execute(
        select(Conversation)
        .where(
            or_(
                Conversation.participant_one_id == current_user.id,
                Conversation.participant_two_id == current_user.id,
            )
        )
        .order_by(Conversation.updated_at.desc())
        .offset(skip)
        .limit(limit)
    )
    conversations = result.scalars().all()
    if not conversations:
        return []
    conv_ids = [c.id for c in conversations]
    others = {
        c.id: c.participant_two_id if c.participant_one_id == current_user.id else c.participant_one_id
        for c in conversations
    }
    users = await user_summaries(db, set(others.values()))

    latest = (
        select(Message.conversation_id, func.max(Message.created_at).label("at"))
        .where(Message.conversation_id.in_(conv_ids))
        .group_by(Message.conversation_id)
        .subquery()
    )
    last_rows = await db.execute(
        select(Message).join(
            latest,
            (Message.conversation_id == latest.c.conversation_id) & (Message.created_at == latest.c.at),
        )
    )
    last_by_conv = {m.conversation_id: m for m in last_rows.scalars().all()}
    unread_rows = await db.execute(
        select(Message.conversation_id, func.count())
        .where(
            Message.conversation_id.in_(conv_ids),
            Message.sender_id != current_user.id,
            Message.is_read.is_(False),
        )
        .group_by(Message.conversation_id)
    )
    unread_by_conv: dict[uuid.UUID, int] = dict(unread_rows.tuples().all())

    out = []
    for c in conversations:
        last = last_by_conv.get(c.id)
        out.append(
            {
                "id": c.id,
                "participant_one_id": c.participant_one_id,
                "participant_two_id": c.participant_two_id,
                "created_at": c.created_at,
                "updated_at": c.updated_at,
                "other_participant": users.get(others[c.id]),
                "last_message": (
                    {"content": last.content, "sender_id": last.sender_id, "created_at": last.created_at}
                    if last
                    else None
                ),
                "unread_count": unread_by_conv.get(c.id, 0),
            }
        )
    return out


@router.get("/conversations/unread-count")
async def unread_message_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await db.scalar(
        select(func.count())
        .select_from(Message)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(
            or_(
                Conversation.participant_one_id == current_user.id,
                Conversation.participant_two_id == current_user.id,
            ),
            Message.sender_id != current_user.id,
            Message.is_read.is_(False),
        )
    )
    return {"count": count or 0}


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.participant_id == current_user.id or not await db.get(User, data.participant_id):
        raise HTTPException(status_code=400, detail="A valid different participant is required")
    first, second = sorted((current_user.id, data.participant_id), key=str)
    existing = await db.scalar(
        select(Conversation).where(
            Conversation.participant_one_id == first,
            Conversation.participant_two_id == second,
        )
    )
    if existing:
        return existing
    conversation = Conversation(participant_one_id=first, participant_two_id=second)
    db.add(conversation)
    await db.flush()
    return conversation


async def get_conversation(
    conversation_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> Conversation:
    conversation = await db.get(Conversation, conversation_id)
    if not conversation or user_id not in (
        conversation.participant_one_id,
        conversation.participant_two_id,
    ):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.get("/conversations/{conversation_id}/messages")
async def message_history(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    await get_conversation(conversation_id, current_user.id, db)
    # Opening a conversation reads it: clear the other party's unread messages.
    await db.execute(
        update(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.sender_id != current_user.id,
            Message.is_read.is_(False),
        )
        .values(is_read=True)
    )
    # Fetch the most recent `limit` messages (bounded, instead of the whole
    # conversation history), then restore ascending order for display.
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(reversed(result.scalars().all()))


@router.post("/conversations/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
async def send_message(
    conversation_id: uuid.UUID,
    data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation = await get_conversation(conversation_id, current_user.id, db)
    message = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        content=data.content,
    )
    db.add(message)
    conversation.updated_at = func.now()
    recipient = (
        conversation.participant_two_id
        if current_user.id == conversation.participant_one_id
        else conversation.participant_one_id
    )
    await notify(
        db,
        recipient,
        "New message",
        f"{current_user.full_name} sent you a message.",
        "message",
    )
    await db.flush()
    await db.refresh(message)
    await emit_analytics_event(
        db, "message_sent", current_user.id, {"conversation_id": str(conversation_id)}
    )
    await manager.broadcast(
        conversation_id,
        {
            "id": str(message.id),
            "conversation_id": str(conversation_id),
            "sender_id": str(current_user.id),
            "content": message.content,
            "created_at": message.created_at.isoformat(),
        },
    )
    return message


class ConnectionManager:
    """
    Redis pub/sub backed connection manager.

    Each API worker keeps local WebSocket connections per conversation and
    subscribes to a Redis channel for that conversation.  Sending a message
    publishes to Redis so every worker receives it; the worker(s) holding the
    sockets then forward it locally.  A local fallback keeps messaging working
    (single-worker or Redis blip) instead of failing outright.
    """

    CHANNEL_PREFIX = "ws_messages"

    def __init__(self) -> None:
        self.active: dict[str, set[WebSocket]] = defaultdict(set)
        self._subscribers: dict[str, aioredis.client.PubSub] = {}
        self._subscriber_tasks: dict[str, asyncio.Task] = {}

    # ── Redis helpers ────────────────────────────────────────────────────────
    @staticmethod
    def _redis() -> aioredis.Redis:
        return aioredis.from_url(
            settings.redis_url,
            socket_connect_timeout=2,
            socket_timeout=2,
            socket_keepalive=True,
        )

    @staticmethod
    def _channel(conversation_id: uuid.UUID) -> str:
        return settings.redis_key(f"{ConnectionManager.CHANNEL_PREFIX}:{conversation_id}")

    # ── Connection bookkeeping ───────────────────────────────────────────────
    async def connect(self, conversation_id: uuid.UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        key = str(conversation_id)
        self.active[key].add(websocket)
        try:
            await self._ensure_subscriber(key)
        except Exception:
            # Redis unavailable — local-only delivery still works via fallback.
            pass

    def disconnect(self, conversation_id: uuid.UUID, websocket: WebSocket) -> None:
        key = str(conversation_id)
        self.active[key].discard(websocket)
        if not self.active[key]:
            self.active.pop(key, None)

    # ── Subscriber lifecycle ─────────────────────────────────────────────────
    async def _ensure_subscriber(self, key: str) -> None:
        task = self._subscriber_tasks.get(key)
        if task and not task.done():
            return
        pubsub = self._redis().pubsub()
        await pubsub.subscribe(self._channel(uuid.UUID(key)))
        self._subscribers[key] = pubsub
        self._subscriber_tasks[key] = asyncio.create_task(self._subscriber_loop(key, pubsub))

    async def _subscriber_loop(self, key: str, pubsub: aioredis.client.PubSub) -> None:
        try:
            async for message in pubsub.listen():
                if message and message.get("type") == "message":
                    try:
                        payload = json.loads(message["data"])
                    except (TypeError, ValueError):
                        continue
                    await self._local_broadcast(key, payload)
        except asyncio.CancelledError:
            pass
        except Exception:
            # Swallow transient Redis errors; a re-connect is attempted on demand.
            pass
        finally:
            try:
                await pubsub.unsubscribe()
                await pubsub.aclose()
            except Exception:
                pass

    # ── Broadcast ────────────────────────────────────────────────────────────
    async def _local_broadcast(self, key: str, payload: dict[str, Any]) -> None:
        for websocket in list(self.active.get(key, ())):
            try:
                await websocket.send_json(payload)
            except Exception:
                try:
                    self.disconnect(uuid.UUID(key), websocket)
                except Exception:
                    pass

    async def broadcast(self, conversation_id: uuid.UUID, payload: dict[str, Any]) -> None:
        key = str(conversation_id)
        try:
            client = self._redis()
            try:
                await client.publish(
                    self._channel(conversation_id),
                    json.dumps(payload, default=str),
                )
            finally:
                await client.aclose()
        except Exception:
            # Local-only fallback (single worker or Redis outage).
            await self._local_broadcast(key, payload)


manager = ConnectionManager()


MAX_WS_MESSAGE_LENGTH = 10_000  # matches MessageCreate.content's REST-path limit


@router.websocket("/messages/ws/{conversation_id}")
async def websocket_messages(
    websocket: WebSocket, conversation_id: uuid.UUID, token: str = Query(...)
):
    async with AsyncSessionFactory() as db:
        try:
            # Same Supabase token verification as HTTP requests.
            user = await authenticate_bearer_token(token, db)
            await get_conversation(conversation_id, user.id, db)
        except Exception:
            await websocket.close(code=4401)
            return
        await manager.connect(conversation_id, websocket)
        try:
            while True:
                raw = await websocket.receive_text()
                if len(raw) > MAX_WS_MESSAGE_LENGTH * 2:
                    # A generous slack over the eventual content-length check
                    # below (JSON framing overhead) -- reject oversized frames
                    # outright rather than parsing them, so a client can't use
                    # this socket to push arbitrarily large payloads at the
                    # server/DB.
                    await websocket.close(code=1009)
                    return
                data = json.loads(raw)
                content = str(data.get("content", "")).strip()[:MAX_WS_MESSAGE_LENGTH]
                if not content:
                    continue
                message = Message(
                    conversation_id=conversation_id,
                    sender_id=user.id,
                    content=content,
                )
                db.add(message)
                conversation = await db.get(Conversation, conversation_id)
                if conversation is not None:
                    recipient = (
                        conversation.participant_two_id
                        if user.id == conversation.participant_one_id
                        else conversation.participant_one_id
                    )
                    await notify(
                        db,
                        recipient,
                        "New message",
                        f"{user.full_name} sent you a message.",
                        "message",
                    )
                await db.commit()
                await db.refresh(message)
                broadcast_payload = {
                    "id": str(message.id),
                    "conversation_id": str(conversation_id),
                    "sender_id": str(user.id),
                    "content": content,
                    "created_at": message.created_at.isoformat(),
                }
                await manager.broadcast(conversation_id, broadcast_payload)
        except WebSocketDisconnect:
            manager.disconnect(conversation_id, websocket)
