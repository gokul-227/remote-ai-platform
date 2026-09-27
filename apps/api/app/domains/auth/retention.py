"""Records that deleting an account must not take with it.

Signed contracts and payment records belong to both parties, and every
foreign key to users cascades: deleting one person would erase the other
party's contract and payment history. Until a retention policy (keep and
anonymise) is decided, such accounts are closed through support instead.
"""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.contracts.models import Contract
from app.domains.projects.models import PaymentTransaction


async def records_to_keep(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    reasons: list[str] = []
    signed = await db.scalar(
        select(Contract.id)
        .where(
            or_(Contract.client_id == user_id, Contract.worker_id == user_id),
            or_(Contract.client_signed_at.is_not(None), Contract.worker_signed_at.is_not(None)),
        )
        .limit(1)
    )
    if signed is not None:
        reasons.append("signed contracts")
    paid = await db.scalar(
        select(PaymentTransaction.id)
        .where(or_(PaymentTransaction.payer_id == user_id, PaymentTransaction.payee_id == user_id))
        .limit(1)
    )
    if paid is not None:
        reasons.append("payment records")
    return reasons
