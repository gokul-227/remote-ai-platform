"""
Organisation members and roles.

    GET    /organisations/memberships/me               organisations I belong to (and pending invitations)
    GET    /organisations/{company_id}/members         members (any active member or owner)
    POST   /organisations/{company_id}/members         invite by email with a role (owner/admin)
    PATCH  /organisations/{company_id}/members/{id}    change role (owner/admin; owner role is implicit)
    DELETE /organisations/{company_id}/members/{id}    remove or withdraw (owner/admin, or the member themself)
    POST   /organisations/invitations/{id}/accept      invited user accepts
    POST   /organisations/invitations/{id}/decline     invited user declines

Authorization is server-side through `companies.access`; the owner is the
profile's user and cannot be removed or demoted here.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.companies.access import role_in
from app.domains.companies.models import MANAGING_ROLES, CompanyProfile, OrganisationMember
from app.domains.companies.schemas import CompanyProfileResponse
from app.services.notifications.service import notify_user

router = APIRouter(prefix="/organisations", tags=["Organisation Members"])

ASSIGNABLE_ROLES = ("admin", "recruiter", "member")


class InviteIn(BaseModel):
    email: EmailStr
    role: str = Field(default="member", pattern="^(admin|recruiter|member)$")


class RoleIn(BaseModel):
    role: str = Field(pattern="^(admin|recruiter|member)$")


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID
    role: str
    status: str
    full_name: str = ""
    email: str = ""
    created_at: datetime


class MembershipOut(BaseModel):
    membership_id: uuid.UUID | None
    role: str
    status: str
    organisation: CompanyProfileResponse


async def _company(db: AsyncSession, company_id: uuid.UUID) -> CompanyProfile:
    company = await db.get(CompanyProfile, company_id)
    if company is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
    return company


async def _require(
    db: AsyncSession, company: CompanyProfile, user: User, roles: frozenset[str] | None
) -> str:
    role = await role_in(db, company, user.id)
    if role is None:
        # Not a member: do not reveal whether the organisation exists.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
    if roles is not None and role not in roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your organisation role does not allow this")
    return role


def _member_out(m: OrganisationMember, u: User | None) -> MemberOut:
    return MemberOut(
        id=m.id,
        user_id=m.user_id,
        role=m.role,
        status=m.status,
        full_name=u.full_name if u else "",
        email=u.email if u else "",
        created_at=m.created_at,
    )


@router.get("/memberships/me", response_model=list[MembershipOut])
async def my_memberships(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[MembershipOut]:
    out: list[MembershipOut] = []
    owned = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == user.id))
    if owned is not None:
        out.append(
            MembershipOut(
                membership_id=None,
                role="owner",
                status="active",
                organisation=CompanyProfileResponse.model_validate(owned),
            )
        )
    rows = (
        await db.execute(
            select(OrganisationMember, CompanyProfile)
            .join(CompanyProfile, CompanyProfile.id == OrganisationMember.company_id)
            .where(OrganisationMember.user_id == user.id)
            .order_by(OrganisationMember.created_at)
        )
    ).all()
    for m, c in rows:
        out.append(
            MembershipOut(
                membership_id=m.id,
                role=m.role,
                status=m.status,
                organisation=CompanyProfileResponse.model_validate(c),
            )
        )
    return out


@router.get("/{company_id}/members", response_model=list[MemberOut])
async def list_members(
    company_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MemberOut]:
    company = await _company(db, company_id)
    await _require(db, company, user, None)
    owner = await db.get(User, company.user_id)
    out = [
        MemberOut(
            id=company.id,  # the owner has no membership row; the profile id is a stable handle
            user_id=company.user_id,
            role="owner",
            status="active",
            full_name=owner.full_name if owner else "",
            email=owner.email if owner else "",
            created_at=company.created_at,
        )
    ]
    rows = (
        await db.execute(
            select(OrganisationMember, User)
            .join(User, User.id == OrganisationMember.user_id)
            .where(OrganisationMember.company_id == company.id)
            .order_by(OrganisationMember.created_at)
        )
    ).all()
    out.extend(_member_out(m, u) for m, u in rows)
    return out


@router.post("/{company_id}/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def invite_member(
    company_id: uuid.UUID,
    body: InviteIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MemberOut:
    company = await _company(db, company_id)
    await _require(db, company, user, MANAGING_ROLES)
    target = await db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if target is None or not target.is_active:
        # Only existing members of the platform can be invited; never leak which emails exist.
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "No active Remote AI Platform account with that email. Ask them to sign up first.",
        )
    if target.id == company.user_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "That person already owns this organisation")
    existing = await db.scalar(
        select(OrganisationMember).where(
            OrganisationMember.company_id == company.id, OrganisationMember.user_id == target.id
        )
    )
    if existing is not None:
        if existing.status == "active":
            raise HTTPException(status.HTTP_409_CONFLICT, "Already a member")
        existing.role = body.role
        existing.invited_by_id = user.id
        member = existing
    else:
        member = OrganisationMember(
            company_id=company.id,
            user_id=target.id,
            role=body.role,
            status="invited",
            invited_by_id=user.id,
        )
        db.add(member)
    await db.flush()
    await notify_user(
        db,
        target.id,
        "Organisation invitation",
        f"{company.name} invited you to join as {body.role}.",
        "organisation_invite",
        email_event_key=f"org-invite:{member.id}:{uuid.uuid4()}",
        email_link="#coprofile",
    )
    await db.flush()
    await db.refresh(member)
    return _member_out(member, target)


@router.patch("/{company_id}/members/{member_id}", response_model=MemberOut)
async def change_role(
    company_id: uuid.UUID,
    member_id: uuid.UUID,
    body: RoleIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MemberOut:
    company = await _company(db, company_id)
    await _require(db, company, user, MANAGING_ROLES)
    member = await db.get(OrganisationMember, member_id)
    if member is None or member.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    member.role = body.role
    await db.flush()
    target = await db.get(User, member.user_id)
    return _member_out(member, target)


@router.delete("/{company_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    company_id: uuid.UUID,
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    company = await _company(db, company_id)
    member = await db.get(OrganisationMember, member_id)
    if member is None or member.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    if (
        member.user_id != user.id
    ):  # leaving is always allowed; removing others needs a managing role
        await _require(db, company, user, MANAGING_ROLES)
    await db.delete(member)
    await db.flush()


async def _invitation(db: AsyncSession, member_id: uuid.UUID, user: User) -> OrganisationMember:
    member = await db.get(OrganisationMember, member_id)
    if member is None or member.user_id != user.id or member.status != "invited":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    return member


@router.post("/invitations/{member_id}/accept", response_model=MemberOut)
async def accept_invitation(
    member_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> MemberOut:
    member = await _invitation(db, member_id, user)
    member.status = "active"
    await db.flush()
    return _member_out(member, user)


@router.post("/invitations/{member_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_invitation(
    member_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> None:
    member = await _invitation(db, member_id, user)
    await db.delete(member)
    await db.flush()
