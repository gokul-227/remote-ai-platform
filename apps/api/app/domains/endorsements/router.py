"""
Endorsements domain FastAPI router.

A connection can vouch for a skill the professional lists on their own
profile. Endorsing is idempotent; counts are visible wherever the profile is.
Hidden profiles show endorsements only to their owner and connections.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.endorsements.models import SkillEndorsement
from app.domains.engineers.models import EngineerProfile
from app.domains.network.models import Connection
from app.services.notifications import notify_user

router = APIRouter(prefix="/endorsements", tags=["Endorsements"])


class EndorseIn(BaseModel):
    user_id: uuid.UUID
    skill: str = Field(min_length=1, max_length=100)


class SkillCount(BaseModel):
    skill: str
    count: int
    endorsed_by_me: bool


async def _connected(db: AsyncSession, a: uuid.UUID, b: uuid.UUID) -> bool:
    return (
        await db.scalar(
            select(Connection.id).where(
                Connection.status == "ACCEPTED",
                or_(
                    and_(Connection.sender_id == a, Connection.receiver_id == b),
                    and_(Connection.sender_id == b, Connection.receiver_id == a),
                ),
            )
        )
        is not None
    )


async def _listed_skill(db: AsyncSession, user_id: uuid.UUID, skill: str) -> str | None:
    profile = await db.scalar(select(EngineerProfile).where(EngineerProfile.user_id == user_id))
    wanted = skill.strip().lower()
    for listed in (profile.skills or []) if profile else []:
        if isinstance(listed, str) and listed.strip().lower() == wanted:
            return wanted
    return None


@router.post("", status_code=status.HTTP_201_CREATED)
async def endorse(
    payload: EndorseIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    if payload.user_id == current_user.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "You can't endorse yourself")
    if not await _connected(db, current_user.id, payload.user_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only your connections can be endorsed")
    skill = await _listed_skill(db, payload.user_id, payload.skill)
    if skill is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That skill isn't on their profile")
    try:
        async with db.begin_nested():
            db.add(SkillEndorsement(endorser_id=current_user.id, endorsee_id=payload.user_id, skill=skill))
        await notify_user(
            db, payload.user_id, "New endorsement", f"{current_user.full_name or 'A connection'} endorsed you for {skill}.", "network"
        )
    except IntegrityError:
        pass  # already endorsed: idempotent
    return {"user_id": str(payload.user_id), "skill": skill, "endorsed": True}


@router.delete("/{user_id}/{skill}")
async def withdraw(
    user_id: uuid.UUID, skill: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    await db.execute(
        delete(SkillEndorsement).where(
            SkillEndorsement.endorser_id == current_user.id,
            SkillEndorsement.endorsee_id == user_id,
            SkillEndorsement.skill == skill.strip().lower(),
        )
    )
    return {"user_id": str(user_id), "skill": skill.strip().lower(), "endorsed": False}


@router.get("/{user_id}", response_model=list[SkillCount])
async def endorsements_for(
    user_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[SkillCount]:
    profile = await db.scalar(select(EngineerProfile).where(EngineerProfile.user_id == user_id))
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    if not profile.is_public and current_user.id != user_id and not await _connected(db, current_user.id, user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    rows = await db.execute(
        select(SkillEndorsement.skill, func.count()).where(SkillEndorsement.endorsee_id == user_id).group_by(SkillEndorsement.skill)
    )
    counts = dict(rows.tuples().all())
    mine = set(
        (await db.execute(
            select(SkillEndorsement.skill).where(
                SkillEndorsement.endorsee_id == user_id, SkillEndorsement.endorser_id == current_user.id
            )
        )).scalars()
    )
    listed = [s.strip().lower() for s in (profile.skills or []) if isinstance(s, str) and s.strip()]
    # Only skills still on the profile count; removing a skill hides its endorsements.
    return sorted(
        (SkillCount(skill=s, count=int(counts.get(s, 0)), endorsed_by_me=s in mine) for s in dict.fromkeys(listed)),
        key=lambda c: (-c.count, c.skill),
    )
