"""Team seats, employer branding and first-contact messaging credits.

All three are no-ops while BILLING_ENABLED is off, so the free product and
existing organisations behave exactly as before.
"""

import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domains.billing import grants, placements

SEAT_STATUSES = ("active", "invited")


async def seat_status(db: AsyncSession, company: Any) -> dict[str, int | bool]:
    """Seats used (active and invited members; the owner is not counted) and included."""
    from app.domains.companies.models import OrganisationMember

    used = int(
        await db.scalar(
            select(func.count()).select_from(OrganisationMember).where(
                OrganisationMember.company_id == company.id, OrganisationMember.status.in_(SEAT_STATUSES)
            )
        )
        or 0
    )
    paid = await grants.balance(db, company.user_id, "team_seats")
    included = settings.BILLING_FREE_TEAM_SEATS + paid
    return {
        "enforced": bool(settings.BILLING_ENABLED),
        "used": used,
        "free": settings.BILLING_FREE_TEAM_SEATS,
        "paid": paid,
        "included": included,
        "available": max(included - used, 0),
    }


async def require_seat(db: AsyncSession, company: Any) -> None:
    """Refuse an invite that would go beyond the organisation's seats (402)."""
    if not settings.BILLING_ENABLED:
        return
    status = await seat_status(db, company)
    if int(status["used"]) >= int(status["included"]):
        raise HTTPException(
            402,
            f"Your organisation uses all {status['included']} team seats. "
            "Add a seat in Settings > Billing (Extra team seat) to invite more people.",
        )


async def branding_enabled(db: AsyncSession, owner_id: uuid.UUID) -> bool:
    return bool(settings.BILLING_ENABLED) and await grants.has_entitlement(db, owner_id, "employer_branding")


async def is_employer(db: AsyncSession, user_id: uuid.UUID) -> bool:
    from app.domains.companies.models import CompanyProfile, OrganisationMember

    if await db.scalar(select(CompanyProfile.id).where(CompanyProfile.user_id == user_id).limit(1)):
        return True
    return bool(
        await db.scalar(
            select(OrganisationMember.id)
            .where(OrganisationMember.user_id == user_id, OrganisationMember.status == "active")
            .limit(1)
        )
    )


async def message_credit_needed(
    db: AsyncSession, sender_id: uuid.UUID, recipient_id: uuid.UUID, conversation_id: uuid.UUID | None
) -> bool:
    """An employer's first message to a candidate they are not connected with costs one credit."""
    if not settings.BILLING_ENABLED:
        return False
    from app.domains.engineers.models import EngineerProfile
    from app.domains.network.models import Connection, Message

    if not await is_employer(db, sender_id):
        return False
    if not await db.scalar(select(EngineerProfile.id).where(EngineerProfile.user_id == recipient_id).limit(1)):
        return False
    connected = await db.scalar(
        select(Connection.id)
        .where(
            Connection.status == "ACCEPTED",
            or_(
                and_(Connection.sender_id == sender_id, Connection.receiver_id == recipient_id),
                and_(Connection.sender_id == recipient_id, Connection.receiver_id == sender_id),
            ),
        )
        .limit(1)
    )
    if connected:
        return False
    if conversation_id is not None and await db.scalar(
        select(Message.id).where(Message.conversation_id == conversation_id).limit(1)
    ):
        return False  # the conversation is already open
    return True


async def charge_first_message(
    db: AsyncSession, sender_id: uuid.UUID, recipient_id: uuid.UUID, conversation_id: uuid.UUID
) -> None:
    """Called by the message composer endpoint before a message is stored."""
    if not await message_credit_needed(db, sender_id, recipient_id, conversation_id):
        return
    if await placements.spend_message_credit(db, sender_id, recipient_id) is None:
        raise HTTPException(
            402,
            "Messaging a candidate you're not connected with uses a messaging credit, and you have none left. "
            "Connect first, or add credits in Settings > Billing.",
        )
