"""
Meetings domain FastAPI router.

Scheduling, invitations and an authorised join flow. The join link is only
released to the organiser and invitees who have not declined, from 15 minutes
before the start until the end; everyone else gets 404. Invitees must already
work with the organiser (an accepted connection or a shared contract), and
blocked pairs can never be invited.
"""

import hashlib
import hmac
import json
import secrets
import uuid
from asyncio import to_thread
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import and_, delete, false, func, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.contracts.lifecycle import party_of
from app.domains.contracts.models import Contract
from app.domains.meetings.models import CallSignal, Meeting, MeetingParticipant
from app.domains.meetings.schemas import (
    MAX_PARTICIPANTS,
    AdmissionDecision,
    AdmissionRequest,
    JoinLink,
    MeetingCreate,
    MeetingReschedule,
    MeetingRespond,
    MeetingResponse,
    MeetingSecurity,
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


def _blocked_pair(first, second):
    """A live, bidirectional block check, also usable for queued signal senders."""
    return (
        select(UserBlock.id)
        .where(
            or_(
                and_(UserBlock.blocker_id == first, UserBlock.blocked_id == second),
                and_(UserBlock.blocker_id == second, UserBlock.blocked_id == first),
            )
        )
        .exists()
    )


async def may_invite(
    db: AsyncSession, organizer: uuid.UUID, invitee: uuid.UUID, contract: Contract | None
) -> bool:
    if await db.scalar(select(_blocked_pair(organizer, invitee))):
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
        waiting_room=m.waiting_room,
        passcode_required=m.passcode_hash is not None,
        participants=[
            ParticipantOut(
                user_id=p.user_id, full_name=name, response=p.response, admission=p.admission
            )
            for p, name in rows.all()
        ],
        phase=_phase(m, datetime.now(UTC)),
        created_at=m.created_at,
    )


async def _visible_meeting(
    db: AsyncSession, meeting_id: uuid.UUID, user: User
) -> tuple[Meeting, MeetingParticipant | None]:
    m = await db.scalar(select(Meeting).where(Meeting.id == meeting_id).with_for_update())
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")
    p = await db.scalar(
        select(MeetingParticipant).where(
            MeetingParticipant.meeting_id == m.id, MeetingParticipant.user_id == user.id
        )
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
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Invite at least one other person"
        )
    for uid in invitees:
        user = await db.get(User, uid)
        if (
            user is None
            or not user.is_active
            or not await may_invite(db, current_user.id, uid, contract)
        ):
            # Same answer for unknown, inactive, unconnected and blocked users.
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "You can only invite people you are connected with or share a contract with",
            )
    if payload.external_url:
        provider, url = "EXTERNAL", payload.external_url
    else:
        provider, url = (
            "JITSI",
            f"{JITSI_BASE}RemoteAI-{secrets.token_urlsafe(18).replace('_', 'x').replace('-', 'y')}",
        )
    m = Meeting(
        organizer_id=current_user.id,
        contract_id=payload.contract_id,
        title=payload.title.strip(),
        agenda=payload.agenda,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        provider=provider,
        join_url=url,
        waiting_room=payload.waiting_room,
        passcode_hash=await _hash_passcode(payload.passcode) if payload.passcode else None,
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
    invited = select(MeetingParticipant.meeting_id).where(
        MeetingParticipant.user_id == current_user.id
    )
    query = select(Meeting).where(
        or_(Meeting.organizer_id == current_user.id, Meeting.id.in_(invited))
    )
    if not include_past:
        query = query.where(Meeting.ends_at >= datetime.now(UTC))
    rows = (
        (
            await db.execute(
                query.order_by(Meeting.starts_at, Meeting.id).offset(offset).limit(limit + 1)
            )
        )
        .scalars()
        .all()
    )
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
        raise HTTPException(
            status.HTTP_409_CONFLICT, "The organiser does not respond to their own meeting"
        )
    if _phase(m, datetime.now(UTC)) in {"CANCELLED", "ENDED"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "This meeting is no longer open")
    if p.response != payload.response:
        p.response = payload.response
        if payload.response == "DECLINED":
            p.admission = "NONE"
        await notify_user(
            db,
            m.organizer_id,
            "Meeting response",
            f"{current_user.full_name or 'An invitee'} {payload.response.lower()} “{m.title}”.",
            "meeting",
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
        ids = (
            await db.execute(
                select(MeetingParticipant.user_id).where(MeetingParticipant.meeting_id == m.id)
            )
        ).scalars()
        for uid in ids:
            await notify_user(
                db, uid, "Meeting cancelled", f"“{m.title}” was cancelled.", "meeting"
            )
    return await _build(db, m)


@router.get("/{meeting_id}/join", response_model=JoinLink)
async def join_meeting(
    meeting_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JoinLink:
    m, p = await _visible_meeting(db, meeting_id, current_user)
    await _check_meeting_block(db, m, current_user.id)
    if p is not None and p.response == "DECLINED":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You declined this meeting; accept it to join"
        )
    phase = _phase(m, datetime.now(UTC))
    if phase == "CANCELLED":
        raise HTTPException(status.HTTP_409_CONFLICT, "This meeting was cancelled")
    if phase == "ENDED":
        raise HTTPException(status.HTTP_409_CONFLICT, "This meeting has ended")
    if phase == "UPCOMING":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You can join from 15 minutes before the start"
        )
    _require_admission(m, p)
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
    rows = (
        await db.execute(select(MeetingParticipant).where(MeetingParticipant.meeting_id == m.id))
    ).scalars()
    for p in rows:
        # A new time needs a new answer.
        p.response = "INVITED"
        p.admission = "NONE"
        p.passcode_attempts = 0
        await notify_user(
            db,
            p.user_id,
            "Meeting rescheduled",
            f"“{m.title}” moved to {m.starts_at:%Y-%m-%d %H:%M} UTC.",
            "meeting",
        )
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
        select(func.count())
        .select_from(MeetingParticipant)
        .where(MeetingParticipant.meeting_id == m.id)
    )
    if (count or 0) >= MAX_PARTICIPANTS:
        raise HTTPException(status.HTTP_409_CONFLICT, "This meeting is full")
    exists = await db.scalar(
        select(MeetingParticipant).where(
            MeetingParticipant.meeting_id == m.id, MeetingParticipant.user_id == payload.user_id
        )
    )
    if exists is None:
        db.add(MeetingParticipant(meeting_id=m.id, user_id=payload.user_id))
        await notify_user(
            db,
            payload.user_id,
            "Meeting invitation",
            f"You were invited to “{m.title}”.",
            "meeting",
        )
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
        select(MeetingParticipant).where(
            MeetingParticipant.meeting_id == m.id, MeetingParticipant.user_id == user_id
        )
    )
    if row is not None:
        await db.delete(row)
        await notify_user(
            db,
            user_id,
            "Removed from meeting",
            f"You are no longer invited to “{m.title}”.",
            "meeting",
        )
        await db.flush()
    return await _build(db, m)


# ── In-app calls: WebRTC signalling relayed through the API ───────────────────

MAX_SIGNAL_BYTES = 16_000
MAX_SIGNALS_PER_MEETING = 5_000


class SignalIn(BaseModel):
    kind: Literal["JOIN", "LEAVE", "OFFER", "ANSWER", "ICE"]
    to_user_id: uuid.UUID | None = None
    payload: dict[str, Any] | None = None


async def _check_meeting_block(db: AsyncSession, m: Meeting, user_id: uuid.UUID) -> None:
    # Invitation eligibility is not a permanent grant after either party blocks.
    if user_id != m.organizer_id and await db.scalar(
        select(_blocked_pair(m.organizer_id, user_id))
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")


async def _in_call(db: AsyncSession, meeting_id: uuid.UUID, user: User) -> Meeting:
    """Only the organiser and non-declined invitees, and only while the meeting is joinable."""
    m, p = await _visible_meeting(db, meeting_id, user)
    await _check_meeting_block(db, m, user.id)
    if p is not None and p.response == "DECLINED":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You declined this meeting; accept it to join"
        )
    if _phase(m, datetime.now(UTC)) != "JOINABLE":
        raise HTTPException(status.HTTP_409_CONFLICT, "This call isn't open right now")
    _require_admission(m, p)
    return m


@router.post("/{meeting_id}/signals", status_code=status.HTTP_201_CREATED)
async def send_signal(
    meeting_id: uuid.UUID,
    payload: SignalIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    m = await _in_call(db, meeting_id, current_user)
    if payload.payload is not None and len(json.dumps(payload.payload)) > MAX_SIGNAL_BYTES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Signal too large")
    if payload.kind in {"OFFER", "ANSWER", "ICE"} and payload.to_user_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Say who the signal is for")
    if payload.to_user_id is not None:
        allowed = {m.organizer_id} | set(
            (
                await db.execute(
                    select(MeetingParticipant.user_id).where(
                        MeetingParticipant.meeting_id == m.id,
                        MeetingParticipant.response != "DECLINED",
                        or_(
                            and_(
                                true() if m.passcode_hash is None and not m.waiting_room else false(),
                                MeetingParticipant.admission != "DENIED",
                            ),
                            MeetingParticipant.admission == "ADMITTED",
                        ),
                    )
                )
            ).scalars()
        )
        if (
            payload.to_user_id not in allowed
            or await db.scalar(select(_blocked_pair(m.organizer_id, payload.to_user_id)))
            or await db.scalar(select(_blocked_pair(current_user.id, payload.to_user_id)))
        ):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "That person isn't in this meeting"
            )
    count = await db.scalar(
        select(func.count()).select_from(CallSignal).where(CallSignal.meeting_id == m.id)
    )
    if (count or 0) >= MAX_SIGNALS_PER_MEETING:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Too much call traffic; rejoin the call"
        )
    sig = CallSignal(
        meeting_id=m.id,
        from_user_id=current_user.id,
        to_user_id=payload.to_user_id,
        kind=payload.kind,
        payload=payload.payload,
    )
    db.add(sig)
    await db.flush()
    return {"id": sig.id}


@router.get("/{meeting_id}/signals")
async def receive_signals(
    meeting_id: uuid.UUID,
    after: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Signals for me (or for everyone) newer than `after`; never my own."""
    m = await _in_call(db, meeting_id, current_user)
    rows = (
        (
            await db.execute(
                select(CallSignal)
                .where(
                    CallSignal.meeting_id == m.id,
                    CallSignal.id > after,
                    CallSignal.from_user_id != current_user.id,
                    or_(CallSignal.to_user_id == current_user.id, CallSignal.to_user_id.is_(None)),
                    or_(
                        CallSignal.from_user_id == m.organizer_id,
                        select(MeetingParticipant.id)
                        .where(
                            MeetingParticipant.meeting_id == m.id,
                            MeetingParticipant.user_id == CallSignal.from_user_id,
                            MeetingParticipant.response != "DECLINED",
                            or_(
                                and_(
                                    true() if m.passcode_hash is None and not m.waiting_room else false(),
                                    MeetingParticipant.admission != "DENIED",
                                ),
                                MeetingParticipant.admission == "ADMITTED",
                            ),
                        )
                        .exists(),
                    ),
                    ~_blocked_pair(m.organizer_id, CallSignal.from_user_id),
                    ~_blocked_pair(current_user.id, CallSignal.from_user_id),
                )
                .order_by(CallSignal.id)
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    names = (
        {
            u.id: u.full_name
            for u in (
                await db.execute(select(User).where(User.id.in_({r.from_user_id for r in rows})))
            ).scalars()
        }
        if rows
        else {}
    )
    return {
        "signals": [
            {
                "id": r.id,
                "kind": r.kind,
                "from_user_id": str(r.from_user_id),
                "from_name": names.get(r.from_user_id),
                "payload": r.payload,
            }
            for r in rows
        ],
        "cursor": rows[-1].id if rows else after,
        "ice_servers": [
            {"urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]}
        ],
    }


async def _hash_passcode(value: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = await to_thread(hashlib.pbkdf2_hmac, "sha256", value.encode(), salt.encode(), 120_000)
    return f"{salt}${digest.hex()}"


def _require_admission(m: Meeting, p: MeetingParticipant | None) -> None:
    if p is not None and (
        p.admission == "DENIED"
        or ((m.passcode_hash or m.waiting_room) and p.admission != "ADMITTED")
    ):
        raise HTTPException(403, "Request admission before joining this meeting")


@router.put("/{meeting_id}/security", response_model=MeetingResponse)
async def meeting_security(
    meeting_id: uuid.UUID,
    payload: MeetingSecurity,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingResponse:
    m = await _organiser_meeting(db, meeting_id, current_user)
    # Serialize admission requests and security changes for this meeting.
    await db.execute(select(Meeting.id).where(Meeting.id == m.id).with_for_update())
    m.passcode_hash = await _hash_passcode(payload.passcode) if payload.passcode else None
    m.waiting_room = payload.waiting_room
    await db.execute(delete(CallSignal).where(CallSignal.meeting_id == m.id))
    rows = (
        await db.scalars(select(MeetingParticipant).where(MeetingParticipant.meeting_id == m.id))
    ).all()
    for p in rows:
        p.admission, p.passcode_attempts = "NONE", 0
    await db.flush()
    return await _build(db, m)


@router.post("/{meeting_id}/admission")
async def request_admission(
    meeting_id: uuid.UUID,
    payload: AdmissionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    await db.execute(select(Meeting.id).where(Meeting.id == meeting_id).with_for_update())
    m, p = await _visible_meeting(db, meeting_id, current_user)
    await _check_meeting_block(db, m, current_user.id)
    if _phase(m, datetime.now(UTC)) != "JOINABLE" or (p and p.response == "DECLINED"):
        raise HTTPException(409, "This call isn't open right now")
    if p is None:
        return {"admission": "ADMITTED"}
    if p.admission in {"DENIED", "ADMITTED", "WAITING"}:
        return {"admission": p.admission}
    if p.passcode_attempts >= 5:
        raise HTTPException(
            429, "Too many passcode attempts; ask the host to reset meeting security"
        )
    if m.passcode_hash:
        supplied = await _hash_passcode(payload.passcode or "", m.passcode_hash.split("$")[0])
        if not hmac.compare_digest(supplied, m.passcode_hash):
            p.passcode_attempts += 1
            # Persist failed attempts: raising would roll back the request transaction.
            await db.commit()
            raise HTTPException(403, "Incorrect meeting passcode")
    p.admission = "WAITING" if m.waiting_room else "ADMITTED"
    await db.flush()
    return {"admission": p.admission}


@router.post("/{meeting_id}/admission/{user_id}", response_model=MeetingResponse)
async def decide_admission(
    meeting_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: AdmissionDecision,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeetingResponse:
    await db.execute(select(Meeting.id).where(Meeting.id == meeting_id).with_for_update())
    m = await _organiser_meeting(db, meeting_id, current_user)
    if _phase(m, datetime.now(UTC)) != "JOINABLE":
        raise HTTPException(409, "This call isn't open right now")
    p = await db.scalar(
        select(MeetingParticipant).where(
            MeetingParticipant.meeting_id == m.id, MeetingParticipant.user_id == user_id
        )
    )
    if p is None:
        raise HTTPException(404, "Participant not found")
    await _check_meeting_block(db, m, user_id)
    if p.response == "DECLINED" or (payload.admission == "ADMITTED" and p.admission != "WAITING"):
        raise HTTPException(409, "Only waiting participants can be admitted")
    p.admission = payload.admission
    if payload.admission == "DENIED":
        await db.execute(
            delete(CallSignal).where(
                CallSignal.meeting_id == m.id,
                or_(CallSignal.from_user_id == user_id, CallSignal.to_user_id == user_id),
            )
        )
    await db.flush()
    return await _build(db, m)
