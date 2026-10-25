"""
Channels domain FastAPI router.

Access is re-checked on every request: PROJECT channels follow project access,
GROUP channels follow the active member list. Sends are idempotent via a
client token; history is keyset-paginated by (created_at, id) so polling never
skips or repeats messages; unread state is stored server-side per member.
"""

import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.channels.models import (
    Channel,
    ChannelMember,
    ChannelMessage,
    ChannelMessageReaction,
)
from app.domains.meetings.router import may_invite
from app.domains.projects.models import Project
from app.domains.projects.router import can_access
from app.services.notifications import notify_user

router = APIRouter(prefix="/channels", tags=["Channels"])

MAX_GROUP_MEMBERS = 50


class ChannelCreate(BaseModel):
    kind: Literal["PROJECT", "GROUP"]
    name: str = Field(min_length=1, max_length=80)
    topic: str | None = Field(default=None, max_length=255)
    project_id: uuid.UUID | None = None
    member_ids: list[uuid.UUID] = Field(default_factory=list, max_length=MAX_GROUP_MEMBERS)


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)
    parent_id: uuid.UUID | None = None
    mentions: list[uuid.UUID] = Field(default_factory=list, max_length=20)
    client_token: str | None = Field(default=None, min_length=8, max_length=64)


class EditIn(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)


# A small fixed set keeps reactions meaningful and avoids storing arbitrary text.
ALLOWED_EMOJI = ("👍", "🎉", "❤️", "👀", "✅", "🙏", "😂", "🚀")


class MemberIn(BaseModel):
    user_id: uuid.UUID


class MuteIn(BaseModel):
    muted: bool


class NotifyIn(BaseModel):
    level: Literal["ALL", "MENTIONS", "NOTHING"]


class ChannelOut(BaseModel):
    id: uuid.UUID
    kind: str
    name: str
    topic: str | None
    project_id: uuid.UUID | None
    owner_id: uuid.UUID
    muted: bool
    notify_level: str
    unread: int


class MessageOut(BaseModel):
    id: uuid.UUID
    channel_id: uuid.UUID
    author_id: uuid.UUID | None
    author_name: str | None
    parent_id: uuid.UUID | None
    body: str
    mentions: list[str]
    reply_count: int = 0
    reactions: dict[str, int] = Field(default_factory=dict)
    my_reactions: list[str] = Field(default_factory=list)
    edited: bool = False
    deleted: bool = False
    created_at: datetime


def _now() -> datetime:
    return datetime.now(UTC)


async def _has_access(db: AsyncSession, ch: Channel, user: User) -> bool:
    if ch.kind == "PROJECT":
        project = await db.get(Project, ch.project_id) if ch.project_id else None
        return project is not None and await can_access(project, user, db)
    member = await db.scalar(
        select(ChannelMember).where(ChannelMember.channel_id == ch.id, ChannelMember.user_id == user.id)
    )
    return bool(member and member.active)


async def _channel(db: AsyncSession, channel_id: uuid.UUID, user: User) -> Channel:
    ch = await db.get(Channel, channel_id)
    if ch is None or ch.archived or not await _has_access(db, ch, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Channel not found")
    return ch


async def _member_row(db: AsyncSession, ch: Channel, user_id: uuid.UUID) -> ChannelMember:
    row = await db.scalar(
        select(ChannelMember).where(ChannelMember.channel_id == ch.id, ChannelMember.user_id == user_id)
    )
    if row is None:
        row = ChannelMember(channel_id=ch.id, user_id=user_id)
        db.add(row)
        await db.flush()
    return row


async def _unread(db: AsyncSession, ch: Channel, since: datetime | None, me: uuid.UUID) -> int:
    q = select(func.count()).select_from(ChannelMessage).where(
        ChannelMessage.channel_id == ch.id, ChannelMessage.author_id != me
    )
    if since is not None:
        q = q.where(ChannelMessage.created_at > since)
    return int(await db.scalar(q) or 0)


async def _out(db: AsyncSession, ch: Channel, user: User) -> ChannelOut:
    row = await db.scalar(
        select(ChannelMember).where(ChannelMember.channel_id == ch.id, ChannelMember.user_id == user.id)
    )
    return ChannelOut(
        id=ch.id, kind=ch.kind, name=ch.name, topic=ch.topic, project_id=ch.project_id, owner_id=ch.owner_id,
        muted=bool(row and row.muted),
        notify_level=row.notify_level if row else "MENTIONS",
        unread=await _unread(db, ch, row.last_read_at if row else None, user.id),
    )


@router.post("", response_model=ChannelOut, status_code=status.HTTP_201_CREATED)
async def create_channel(
    payload: ChannelCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> ChannelOut:
    if payload.kind == "PROJECT":
        project = await db.get(Project, payload.project_id) if payload.project_id else None
        if project is None or not await can_access(project, current_user, db):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    elif payload.project_id is not None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Group channels are not tied to a project")
    ch = Channel(kind=payload.kind, project_id=payload.project_id, owner_id=current_user.id,
                 name=payload.name.strip(), topic=payload.topic)
    db.add(ch)
    await db.flush()
    db.add(ChannelMember(channel_id=ch.id, user_id=current_user.id, last_read_at=_now()))
    if payload.kind == "GROUP":
        for uid in dict.fromkeys(payload.member_ids):
            if uid == current_user.id:
                continue
            invitee = await db.get(User, uid)
            if invitee is None or not invitee.is_active or not await may_invite(db, current_user.id, uid, None):
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT, "You can only add people you are connected with"
                )
            db.add(ChannelMember(channel_id=ch.id, user_id=uid))
    await db.flush()
    return await _out(db, ch, current_user)


@router.get("", response_model=list[ChannelOut])
async def my_channels(
    project_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ChannelOut]:
    if project_id is not None:
        project = await db.get(Project, project_id)
        if project is None or not await can_access(project, current_user, db):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
        rows = await db.execute(
            select(Channel).where(Channel.project_id == project_id, Channel.archived.is_(False)).order_by(Channel.name)
        )
        return [await _out(db, ch, current_user) for ch in rows.scalars()]
    group_ids = select(ChannelMember.channel_id).where(
        ChannelMember.user_id == current_user.id, ChannelMember.active.is_(True)
    )
    rows = await db.execute(
        select(Channel).where(
            Channel.archived.is_(False),
            or_(and_(Channel.kind == "GROUP", Channel.id.in_(group_ids)), Channel.kind == "PROJECT"),
        ).order_by(Channel.name).limit(500)
    )
    out = []
    for ch in rows.scalars():
        if ch.kind == "PROJECT" and not await _has_access(db, ch, current_user):
            continue
        out.append(await _out(db, ch, current_user))
    return out


async def _messages_out(
    db: AsyncSession, rows: list[ChannelMessage], viewer: uuid.UUID | None = None
) -> list[MessageOut]:
    ids = [m.id for m in rows]
    reactions: dict[uuid.UUID, dict[str, int]] = {}
    mine: dict[uuid.UUID, list[str]] = {}
    if ids:
        for mid, emoji, n in (await db.execute(
            select(ChannelMessageReaction.message_id, ChannelMessageReaction.emoji, func.count())
            .where(ChannelMessageReaction.message_id.in_(ids))
            .group_by(ChannelMessageReaction.message_id, ChannelMessageReaction.emoji)
        )).tuples():
            reactions.setdefault(mid, {})[emoji] = n
        if viewer is not None:
            for mid, emoji in (await db.execute(
                select(ChannelMessageReaction.message_id, ChannelMessageReaction.emoji).where(
                    ChannelMessageReaction.message_id.in_(ids), ChannelMessageReaction.user_id == viewer
                )
            )).tuples():
                mine.setdefault(mid, []).append(emoji)
    counts = dict(
        (await db.execute(
            select(ChannelMessage.parent_id, func.count()).where(ChannelMessage.parent_id.in_(ids)).group_by(ChannelMessage.parent_id)
        )).all()
    ) if ids else {}
    authors = {u.id: u.full_name for u in (await db.execute(
        select(User).where(User.id.in_({m.author_id for m in rows if m.author_id}))
    )).scalars()} if rows else {}
    return [
        MessageOut(
            id=m.id, channel_id=m.channel_id, author_id=m.author_id, author_name=authors.get(m.author_id) if m.author_id else None,
            parent_id=m.parent_id,
            body="" if m.deleted_at else m.body,
            mentions=[] if m.deleted_at else list(m.mentions or []),
            reply_count=int(counts.get(m.id, 0)),
            reactions={} if m.deleted_at else reactions.get(m.id, {}),
            my_reactions=mine.get(m.id, []),
            edited=m.edited_at is not None,
            deleted=m.deleted_at is not None,
            created_at=m.created_at,
        )
        for m in rows
    ]


@router.get("/{channel_id}/messages", response_model=list[MessageOut])
async def history(
    channel_id: uuid.UUID,
    after: datetime | None = Query(None, description="Only messages newer than this (polling)"),
    before: datetime | None = Query(None, description="Only messages older than this (scroll back)"),
    thread: uuid.UUID | None = Query(None, description="Replies to this root message"),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MessageOut]:
    ch = await _channel(db, channel_id, current_user)
    q = select(ChannelMessage).where(ChannelMessage.channel_id == ch.id)
    q = q.where(ChannelMessage.parent_id == thread) if thread else q.where(ChannelMessage.parent_id.is_(None))
    if after is not None:
        rows = (await db.execute(q.where(ChannelMessage.created_at > after)
                                 .order_by(ChannelMessage.created_at, ChannelMessage.id).limit(limit))).scalars().all()
    else:
        if before is not None:
            q = q.where(ChannelMessage.created_at < before)
        rows = list(reversed((await db.execute(
            q.order_by(ChannelMessage.created_at.desc(), ChannelMessage.id.desc()).limit(limit)
        )).scalars().all()))
    return await _messages_out(db, list(rows), current_user.id)


@router.post("/{channel_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def post_message(
    channel_id: uuid.UUID,
    payload: MessageIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageOut:
    ch = await _channel(db, channel_id, current_user)
    if payload.client_token:
        existing = await db.scalar(
            select(ChannelMessage).where(
                ChannelMessage.author_id == current_user.id, ChannelMessage.client_token == payload.client_token
            )
        )
        if existing is not None:
            return (await _messages_out(db, [existing]))[0]
    if payload.parent_id is not None:
        parent = await db.get(ChannelMessage, payload.parent_id)
        if parent is None or parent.channel_id != ch.id or parent.parent_id is not None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Replies go on a top-level message in this channel")
    mentioned: list[uuid.UUID] = []
    for uid in dict.fromkeys(payload.mentions):
        user = await db.get(User, uid)
        if user is not None and uid != current_user.id and await _has_access(db, ch, user):
            mentioned.append(uid)
    msg = ChannelMessage(
        channel_id=ch.id, author_id=current_user.id, parent_id=payload.parent_id, body=payload.body,
        mentions=[str(u) for u in mentioned], client_token=payload.client_token, created_at=_now(),
    )
    try:
        async with db.begin_nested():
            db.add(msg)
            await db.flush()
    except IntegrityError:
        # A concurrent retry with the same client_token won the insert.
        existing = await db.scalar(
            select(ChannelMessage).where(
                ChannelMessage.author_id == current_user.id, ChannelMessage.client_token == payload.client_token
            )
        )
        if existing is None:
            raise
        return (await _messages_out(db, [existing]))[0]
    # Sending marks the channel read for the sender.
    (await _member_row(db, ch, current_user.id)).last_read_at = msg.created_at
    await db.flush()
    # Muted channels and NOTHING suppress everything, mentions included; ALL also
    # hears about new top-level messages (thread replies only notify mentions).
    prefs = {
        m.user_id: ("NOTHING" if m.muted else m.notify_level)
        for m in (await db.execute(select(ChannelMember).where(ChannelMember.channel_id == ch.id))).scalars()
    }
    preview = f"{current_user.full_name or 'Someone'}: {payload.body[:140]}"
    for uid in mentioned:
        if prefs.get(uid, "MENTIONS") != "NOTHING":
            await notify_user(db, uid, f"Mentioned in #{ch.name}", preview, "channel")
    if payload.parent_id is None:
        for uid, level in prefs.items():
            if level == "ALL" and uid != current_user.id and uid not in mentioned:
                member = await db.get(User, uid)
                if member is not None and await _has_access(db, ch, member):
                    await notify_user(db, uid, f"New in #{ch.name}", preview, "channel")
    return (await _messages_out(db, [msg]))[0]


async def _message_in(db: AsyncSession, ch: Channel, message_id: uuid.UUID) -> ChannelMessage:
    msg = await db.get(ChannelMessage, message_id)
    if msg is None or msg.channel_id != ch.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    return msg


@router.patch("/{channel_id}/messages/{message_id}", response_model=MessageOut)
async def edit_message(
    channel_id: uuid.UUID, message_id: uuid.UUID, payload: EditIn,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> MessageOut:
    ch = await _channel(db, channel_id, current_user)
    msg = await _message_in(db, ch, message_id)
    if msg.author_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own messages")
    if msg.deleted_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This message was deleted")
    msg.body = payload.body
    msg.edited_at = _now()
    await db.flush()
    return (await _messages_out(db, [msg], current_user.id))[0]


@router.delete("/{channel_id}/messages/{message_id}", response_model=MessageOut)
async def delete_message(
    channel_id: uuid.UUID, message_id: uuid.UUID,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> MessageOut:
    ch = await _channel(db, channel_id, current_user)
    msg = await _message_in(db, ch, message_id)
    if msg.author_id != current_user.id and ch.owner_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the author or the channel owner can delete this")
    if msg.deleted_at is None:
        msg.deleted_at = _now()
        msg.body = ""
        msg.mentions = []
        await db.flush()
    return (await _messages_out(db, [msg], current_user.id))[0]


@router.put("/{channel_id}/messages/{message_id}/reactions/{emoji}", response_model=MessageOut)
async def add_reaction(
    channel_id: uuid.UUID, message_id: uuid.UUID, emoji: str,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> MessageOut:
    ch = await _channel(db, channel_id, current_user)
    msg = await _message_in(db, ch, message_id)
    if emoji not in ALLOWED_EMOJI:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unsupported reaction")
    if msg.deleted_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This message was deleted")
    try:
        async with db.begin_nested():
            db.add(ChannelMessageReaction(message_id=msg.id, user_id=current_user.id, emoji=emoji))
    except IntegrityError:
        pass  # already reacted with this emoji
    return (await _messages_out(db, [msg], current_user.id))[0]


@router.delete("/{channel_id}/messages/{message_id}/reactions/{emoji}", response_model=MessageOut)
async def remove_reaction(
    channel_id: uuid.UUID, message_id: uuid.UUID, emoji: str,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> MessageOut:
    ch = await _channel(db, channel_id, current_user)
    msg = await _message_in(db, ch, message_id)
    await db.execute(
        delete(ChannelMessageReaction).where(
            ChannelMessageReaction.message_id == msg.id,
            ChannelMessageReaction.user_id == current_user.id,
            ChannelMessageReaction.emoji == emoji,
        )
    )
    return (await _messages_out(db, [msg], current_user.id))[0]


@router.post("/{channel_id}/read", response_model=ChannelOut)
async def mark_read(channel_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> ChannelOut:
    ch = await _channel(db, channel_id, current_user)
    (await _member_row(db, ch, current_user.id)).last_read_at = _now()
    await db.flush()
    return await _out(db, ch, current_user)


@router.post("/{channel_id}/mute", response_model=ChannelOut)
async def set_mute(
    channel_id: uuid.UUID, payload: MuteIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> ChannelOut:
    ch = await _channel(db, channel_id, current_user)
    (await _member_row(db, ch, current_user.id)).muted = payload.muted
    await db.flush()
    return await _out(db, ch, current_user)


@router.post("/{channel_id}/notifications", response_model=ChannelOut)
async def set_notify_level(
    channel_id: uuid.UUID, payload: NotifyIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> ChannelOut:
    ch = await _channel(db, channel_id, current_user)
    (await _member_row(db, ch, current_user.id)).notify_level = payload.level
    await db.flush()
    return await _out(db, ch, current_user)


@router.post("/{channel_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(
    channel_id: uuid.UUID, payload: MemberIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    ch = await _channel(db, channel_id, current_user)
    if ch.kind != "GROUP":
        raise HTTPException(status.HTTP_409_CONFLICT, "Project channel members follow the project's members")
    if ch.owner_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the channel owner adds members")
    user = await db.get(User, payload.user_id)
    if user is None or not user.is_active or not await may_invite(db, current_user.id, payload.user_id, None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "You can only add people you are connected with")
    active = await db.scalar(
        select(func.count()).select_from(ChannelMember).where(ChannelMember.channel_id == ch.id, ChannelMember.active.is_(True))
    )
    if (active or 0) >= MAX_GROUP_MEMBERS:
        raise HTTPException(status.HTTP_409_CONFLICT, "This channel is full")
    row = await _member_row(db, ch, payload.user_id)
    row.active = True
    return {"channel_id": str(ch.id), "user_id": str(payload.user_id), "active": True}


@router.delete("/{channel_id}/members/{user_id}")
async def remove_member(
    channel_id: uuid.UUID, user_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    ch = await _channel(db, channel_id, current_user)
    if ch.kind != "GROUP":
        raise HTTPException(status.HTTP_409_CONFLICT, "Project channel members follow the project's members")
    if user_id != current_user.id and ch.owner_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the channel owner removes other members")
    if user_id == ch.owner_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "The owner cannot leave their own channel")
    row = await db.scalar(select(ChannelMember).where(ChannelMember.channel_id == ch.id, ChannelMember.user_id == user_id))
    if row is not None:
        row.active = False
    return {"channel_id": str(ch.id), "user_id": str(user_id), "active": False}
