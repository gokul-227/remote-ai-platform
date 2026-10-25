"""
Meetings domain FastAPI router.

Scheduling, invitations and an authorised join flow. The join link is only
released to the organiser and invitees who have not declined, from 15 minutes
before the start until the end; everyone else gets 404. Invitees must already
work with the organiser (an accepted connection or a shared contract), and
blocked pairs can never be invited.
"""

import json
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.contracts.lifecycle import party_of
from app.domains.contracts.models import Contract
from app.domains.meetings.models import Meeting, MeetingParticipant
from app.domains.meetings.schemas import (
    MAX_PARTICIPANTS,
    JoinLink,
    MeetingCreate,
    MeetingReschedule,
    MeetingRespond,
    MeetingResponse,
    ParticipantIn,
    ParticipantOut,
)
from app.domains.network.models import Connection, UserBlock
from app.services.notifications import notify_user

router = APIRouter(prefix="/meetings", tags=["Meetings"])

JOIN_EARLY = timedelta(minutes=15)
JITSI_BASE = "https://meet.jit.si/"


def _phase(m: Meeting, now: datetime) -> str:
    if m.status == "CANCELLED":
        return "CANCELLED"
    starts, ends = _utc(m.starts_at), _utc(m.ends_at)
    if now > ends:
        return "ENDED"
    if now >= starts - JOIN_EARLY:
        return "JOINABLE"
    return "UPCOMING"


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


async def may_invite(db: AsyncSession, organizer: uuid.UUID, invitee: uuid.UUID, contract: Contract | None) -> bool:
    blocked = await db.scalar(
        select(UserBlock.id).where(
            or_(
                and_(UserBlock.blocker_id == organizer, UserBlock.blocked_id == invitee),
                and_(UserBlock.blocker_id == invitee, UserBlock.blocked_id == organizer),
            )
        )
    )
    if blocked:
        return False
    if contract is not None and party_of(contract, invitee) is not None:
        return True
    connected = await db.scalar(
        select(Connection.id).where(
            Connection.status == "ACCEPTED",
            or_(
                and_(Connection.sender_id == organizer, Connection.receiver_id == invitee),
                and_(Connection.sender_id == invitee, Connection.receiver_id == organizer),
            ),
        )
    )
    return connected is not None


async def _build(db: AsyncSession, m: Meeting) -> MeetingResponse:
    rows = await db.execute(
        select(MeetingParticipant, User.full_name)
        .join(User, User.id == MeetingParticipant.user_id)
        .where(MeetingParticipant.meeting_id == m.id)
        .order_by(MeetingParticipant.created_at)
    )
    return MeetingResponse(
        id=m.id,
        organizer_id=m.organizer_id,
        contract_id=m.contract_id,
        title=m.title,
        agenda=m.agenda,
        starts_at=m.starts_at,
        ends_at=m.ends_at,
        provider=m.provider,
        status=m.status,
        participants=[ParticipantOut(user_id=p.user_id, full_name=name, response=p.response) for p, name in rows.all()],
        phase=_phase(m, datetime.now(UTC)),
        created_at=m.created_at,
    )


async def _visible_meeting(db: AsyncSession, meeting_id: uuid.UUID, user: User) -> tuple[Meeting, MeetingParticipant | None]:
    m = await db.get(Meeting, meeting_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")
    p = await db.scalar(
        select(MeetingParticipant).where(MeetingParticipant.meeting_id == m.id, MeetingParticipant.user_id == user.id)
    )
    if m.organizer_id != user.id and p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")
    return m, p


@router.post("", response_model=MeetingResponse, status_code=status.HTTP_201_CREATED)
async def schedule_meeting(
    payload: MeetingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingResponse:
    contract = None
    if payload.contract_id is not None:
        contract = await db.get(Contract, payload.contract_id)
        if contract is None or contract.is_deleted or party_of(contract, current_user.id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    invitees = [uid for uid in payload.participant_ids if uid != current_user.id]
    if not invitees:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invite at least one other person")
    for uid in invitees:
        user = await db.get(User, uid)
        if user is None or not user.is_active or not await may_invite(db, current_user.id, uid, contract):
            # Same answer for unknown, inactive, unconnected and blocked users.
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "You can only invite people you are connected with or share a contract with",
            )
    if payload.external_url:
        provider, url = "EXTERNAL", payload.external_url
    else:
        provider, url = "JITSI", f"{JITSI_BASE}RemoteAI-{secrets.token_urlsafe(18).replace('_', 'x').replace('-', 'y')}"
    m = Meeting(
        organizer_id=current_user.id,
        contract_id=payload.contract_id,
        title=payload.title.strip(),
        agenda=payload.agenda,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        provider=provider,
        join_url=url,
    )
    db.add(m)
    await db.flush()
    for uid in invitees:
        db.add(MeetingParticipant(meeting_id=m.id, user_id=uid))
        await notify_user(
            db,
            uid,
            "Meeting invitation",
            f"{current_user.full_name or 'Someone'} invited you to “{m.title}” on {m.starts_at:%Y-%m-%d %H:%M} UTC.",
            "meeting",
        )
    await db.flush()
    return await _build(db, m)


@router.get("", response_model=list[MeetingResponse])
async def list_my_meetings(
    response: Response,
    include_past: bool = False,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MeetingResponse]:
    invited = select(MeetingParticipant.meeting_id).where(MeetingParticipant.user_id == current_user.id)
    query = select(Meeting).where(or_(Meeting.organizer_id == current_user.id, Meeting.id.in_(invited)))
    if not include_past:
        query = query.where(Meeting.ends_at >= datetime.now(UTC))
    rows = (await db.execute(query.order_by(Meeting.starts_at, Meeting.id).offset(offset).limit(limit + 1))).scalars().all()
    response.headers["X-Has-More"] = "true" if len(rows) > limit else "false"
    return [await _build(db, m) for m in rows[:limit]]


@router.get("/{meeting_id}", response_model=MeetingResponse)
async def get_meeting(
    meeting_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingResponse:
    m, _ = await _visible_meeting(db, meeting_id, current_user)
    return await _build(db, m)


@router.post("/{meeting_id}/respond", response_model=MeetingResponse)
async def respond_to_meeting(
    meeting_id: uuid.UUID,
    payload: MeetingRespond,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingResponse:
    m, p = await _visible_meeting(db, meeting_id, current_user)
    if p is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "The organiser does not respond to their own meeting")
    if _phase(m, datetime.now(UTC)) in {"CANCELLED", "ENDED"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "This meeting is no longer open")
    if p.response != payload.response:
        p.response = payload.response
        await notify_user(
            db, m.organizer_id, "Meeting response",
            f"{current_user.full_name or 'An invitee'} {payload.response.lower()} “{m.title}”.", "meeting",
        )
    return await _build(db, m)


@router.post("/{meeting_id}/cancel", response_model=MeetingResponse)
async def cancel_meeting(
    meeting_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingResponse:
    m, _ = await _visible_meeting(db, meeting_id, current_user)
    if m.organizer_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the organiser can cancel this meeting")
    if m.status != "CANCELLED":
        m.status = "CANCELLED"
        ids = (await db.execute(select(MeetingParticipant.user_id).where(MeetingParticipant.meeting_id == m.id))).scalars()
        for uid in ids:
            await notify_user(db, uid, "Meeting cancelled", f"“{m.title}” was cancelled.", "meeting")
    return await _build(db, m)


@router.get("/{meeting_id}/join", response_model=JoinLink)
async def join_meeting(
    meeting_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JoinLink:
    m, p = await _visible_meeting(db, meeting_id, current_user)
    if p is not None and p.response == "DECLINED":
        raise HTTPException(status.HTTP_409_CONFLICT, "You declined this meeting; accept it to join")
    phase = _phase(m, datetime.now(UTC))
    if phase == "CANCELLED":
        raise HTTPException(status.HTTP_409_CONFLICT, "This meeting was cancelled")
    if phase == "ENDED":
        raise HTTPException(status.HTTP_409_CONFLICT, "This meeting has ended")
    if phase == "UPCOMING":
        raise HTTPException(status.HTTP_409_CONFLICT, "You can join from 15 minutes before the start")
    url = m.join_url
    if m.provider == "JITSI" and current_user.full_name:
        # Jitsi reads URL-fragment config, so the participant arrives with their
        # own name; the fragment never reaches a server log.
        url = f"{url}#userInfo.displayName={quote(json.dumps(current_user.full_name[:60]))}"
    return JoinLink(url=url, provider=m.provider)


async def _organiser_meeting(db: AsyncSession, meeting_id: uuid.UUID, user: User) -> Meeting:
    m, _ = await _visible_meeting(db, meeting_id, user)
    if m.organizer_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the organiser can change this meeting")
    if _phase(m, datetime.now(UTC)) in {"CANCELLED", "ENDED"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "This meeting is no longer open")
    return m


@router.patch("/{meeting_id}", response_model=MeetingResponse)
async def reschedule_meeting(
    meeting_id: uuid.UUID,
    payload: MeetingReschedule,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingResponse:
    m = await _organiser_meeting(db, meeting_id, current_user)
    m.starts_at, m.ends_at = payload.starts_at, payload.ends_at
    rows = (await db.execute(select(MeetingParticipant).where(MeetingParticipant.meeting_id == m.id))).scalars()
    for p in rows:
        # A new time needs a new answer.
        p.response = "INVITED"
        await notify_user(db, p.user_id, "Meeting rescheduled", f"“{m.title}” moved to {m.starts_at:%Y-%m-%d %H:%M} UTC.", "meeting")
    await db.flush()
    return await _build(db, m)


@router.post("/{meeting_id}/participants", response_model=MeetingResponse)
async def add_participant(
    meeting_id: uuid.UUID,
    payload: ParticipantIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingResponse:
    m = await _organiser_meeting(db, meeting_id, current_user)
    contract = await db.get(Contract, m.contract_id) if m.contract_id else None
    user = await db.get(User, payload.user_id)
    if (
        payload.user_id == current_user.id
        or user is None
        or not user.is_active
        or not await may_invite(db, current_user.id, payload.user_id, contract)
    ):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "You can only invite people you are connected with or share a contract with",
        )
    count = await db.scalar(
        select(func.count()).select_from(MeetingParticipant).where(MeetingParticipant.meeting_id == m.id)
    )
    if (count or 0) >= MAX_PARTICIPANTS:
        raise HTTPException(status.HTTP_409_CONFLICT, "This meeting is full")
    exists = await db.scalar(
        select(MeetingParticipant).where(MeetingParticipant.meeting_id == m.id, MeetingParticipant.user_id == payload.user_id)
    )
    if exists is None:
        db.add(MeetingParticipant(meeting_id=m.id, user_id=payload.user_id))
        await notify_user(db, payload.user_id, "Meeting invitation", f"You were invited to “{m.title}”.", "meeting")
        await db.flush()
    return await _build(db, m)


@router.delete("/{meeting_id}/participants/{user_id}", response_model=MeetingResponse)
async def remove_participant(
    meeting_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingResponse:
    m = await _organiser_meeting(db, meeting_id, current_user)
    row = await db.scalar(
        select(MeetingParticipant).where(MeetingParticipant.meeting_id == m.id, MeetingParticipant.user_id == user_id)
    )
    if row is not None:
        await db.delete(row)
        await notify_user(db, user_id, "Removed from meeting", f"You are no longer invited to “{m.title}”.", "meeting")
        await db.flush()
    return await _build(db, m)
