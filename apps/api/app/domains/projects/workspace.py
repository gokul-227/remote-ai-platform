"""Project workspace aggregation; resource permissions remain authoritative."""
import uuid

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User
from app.domains.contracts.models import Contract


async def project_workspace(project_id: uuid.UUID, user: User, db: AsyncSession):
    # Local imports avoid cycles: collaboration domains use project permission helpers.
    from app.domains.channels.models import Channel
    from app.domains.channels.router import _has_access, _out
    from app.domains.contracts.router import _enrich_contract
    from app.domains.documents.models import Document
    from app.domains.documents.router import _role, _summary
    from app.domains.meetings.models import Meeting, MeetingParticipant
    from app.domains.meetings.router import _build
    from app.domains.projects.router import require_project_access

    project = await require_project_access(project_id, user, db)
    if project.is_deleted:
        raise HTTPException(404, "Project not found")
    # Membership never grants access to another member's contract terms.
    contracts = (await db.scalars(select(Contract).where(
        Contract.project_id == project.id, Contract.is_deleted.is_(False),
        or_(Contract.client_id == user.id, Contract.worker_id == user.id),
    ).order_by(Contract.created_at.desc()).limit(100))).all()
    contract_ids = [c.id for c in contracts]
    documents = []
    rows = await db.scalars(select(Document).where(
        Document.is_deleted.is_(False),
        or_(Document.project_id == project.id, Document.contract_id.in_(contract_ids)),
    ).order_by(Document.updated_at.desc()).limit(200))
    for doc in rows:
        role = await _role(db, doc, user)
        if role:
            documents.append(_summary(doc, role))
    channels = []
    channel_rows = await db.scalars(select(Channel).where(
        Channel.project_id == project.id, Channel.archived.is_(False),
    ).order_by(Channel.name).limit(100))
    for channel in channel_rows:
        if await _has_access(db, channel, user):
            channels.append(await _out(db, channel, user))
    # An invitation is required even when the user owns the linked project.
    invited = select(MeetingParticipant.meeting_id).where(MeetingParticipant.user_id == user.id)
    project_contracts = select(Contract.id).where(
        Contract.project_id == project.id, Contract.is_deleted.is_(False),
    )
    meetings = (await db.scalars(select(Meeting).where(
        Meeting.contract_id.in_(project_contracts),
        or_(Meeting.organizer_id == user.id, Meeting.id.in_(invited)),
    ).order_by(Meeting.starts_at.desc()).limit(100))).all()
    return {
        "project_id": project.id,
        "contracts": [await _enrich_contract(c, db) for c in contracts],
        "documents": documents,
        "channels": channels,
        "meetings": [await _build(db, m) for m in meetings],
        "limits": {"contracts": 100, "documents": 200, "channels": 100, "meetings": 100},
    }
