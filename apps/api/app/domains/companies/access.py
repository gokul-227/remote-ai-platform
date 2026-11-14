"""
Organisation-level authorization.

`resolve_company_for(db, user, roles)` answers "which organisation is this
user acting for, and may they do this?" in one place, so jobs, applications
and the organisation page all agree. The profile owner always qualifies;
other users qualify through an *active* `organisation_members` row whose
role is in `roles`. Staff (ADMIN) are handled by the callers as before.
"""

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User
from app.domains.companies.models import CompanyProfile, OrganisationMember


async def role_in(db: AsyncSession, company: CompanyProfile, user_id: uuid.UUID) -> str | None:
    """The user's effective role in the organisation, or None."""
    if company.user_id == user_id:
        return "owner"
    row = await db.scalar(
        select(OrganisationMember.role).where(
            OrganisationMember.company_id == company.id,
            OrganisationMember.user_id == user_id,
            OrganisationMember.status == "active",
        )
    )
    return row


async def resolve_company_for(
    db: AsyncSession, user: User, roles: Iterable[str] | None = None
) -> CompanyProfile | None:
    """The organisation the user owns, else the first one where they hold one of `roles`."""
    owned = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == user.id))
    if owned is not None:
        return owned
    wanted = set(roles) if roles is not None else None
    stmt = (
        select(CompanyProfile)
        .join(OrganisationMember, OrganisationMember.company_id == CompanyProfile.id)
        .where(OrganisationMember.user_id == user.id, OrganisationMember.status == "active")
        .order_by(OrganisationMember.created_at)
    )
    if wanted is not None:
        stmt = stmt.where(OrganisationMember.role.in_(sorted(wanted)))
    return await db.scalar(stmt.limit(1))


async def companies_for(
    db: AsyncSession, user: User, roles: Iterable[str] | None = None
) -> list[CompanyProfile]:
    """Every organisation the user may act for (owned first)."""
    out: list[CompanyProfile] = []
    owned = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == user.id))
    if owned is not None:
        out.append(owned)
    wanted = set(roles) if roles is not None else None
    stmt = (
        select(CompanyProfile)
        .join(OrganisationMember, OrganisationMember.company_id == CompanyProfile.id)
        .where(OrganisationMember.user_id == user.id, OrganisationMember.status == "active")
        .order_by(OrganisationMember.created_at)
    )
    if wanted is not None:
        stmt = stmt.where(OrganisationMember.role.in_(sorted(wanted)))
    for company in (await db.execute(stmt)).scalars().all():
        if owned is None or company.id != owned.id:
            out.append(company)
    return out
