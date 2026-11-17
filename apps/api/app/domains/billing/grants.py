"""Entitlement checks and grants: the one helper features use.

Features ask `has_entitlement` (a capability, optionally for one subject such
as a job), `balance` (credits), or the monthly helpers (proposals, messaging
credits). Grants are idempotent on (source_ref, key), so a replayed webhook
grants nothing twice; revoking a source revokes everything it granted.
"""

import uuid
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.billing.models import CreditUsage, Entitlement


def now() -> datetime:
    return datetime.now(UTC)


def month_key(at: datetime | None = None) -> str:
    return (at or now()).strftime("%Y-%m")


def in_force(at: datetime | None = None) -> Any:
    at = at or now()
    return and_(
        Entitlement.revoked_at.is_(None),
        or_(Entitlement.expires_at.is_(None), Entitlement.expires_at > at),
        Entitlement.starts_at <= at,
    )


async def active(
    db: AsyncSession, user_id: uuid.UUID, key: str, subject_id: str | None = None
) -> list[Entitlement]:
    stmt = select(Entitlement).where(
        Entitlement.user_id == user_id, Entitlement.key == key, in_force()
    )
    if subject_id is not None:
        stmt = stmt.where(Entitlement.subject_id == subject_id)
    stmt = stmt.order_by(Entitlement.expires_at.is_(None), Entitlement.expires_at, Entitlement.created_at)
    return list((await db.scalars(stmt)).all())


async def has_entitlement(
    db: AsyncSession, user_id: uuid.UUID, key: str, subject_id: str | None = None
) -> bool:
    return any(e.quantity > 0 for e in await active(db, user_id, key, subject_id))


async def balance(db: AsyncSession, user_id: uuid.UUID, key: str) -> int:
    return sum(max(e.quantity, 0) for e in await active(db, user_id, key))


async def max_value(db: AsyncSession, user_id: uuid.UUID, key: str) -> int:
    return max((e.quantity for e in await active(db, user_id, key)), default=0)


async def consume(db: AsyncSession, user_id: uuid.UUID, key: str, amount: int = 1) -> list[uuid.UUID]:
    """Take `amount` from the soonest-expiring credits. Returns the rows used,
    or [] (and changes nothing) when the balance is too small."""
    rows = [e for e in await active(db, user_id, key) if e.quantity > 0]
    if sum(e.quantity for e in rows) < amount:
        return []
    used: list[uuid.UUID] = []
    left = amount
    for row in rows:
        take = min(row.quantity, left)
        row.quantity -= take
        used.append(row.id)
        left -= take
        if left == 0:
            break
    await db.flush()
    return used


async def grant(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    key: str,
    quantity: int,
    source: str,
    source_ref: str,
    subject_type: str | None = None,
    subject_id: str | None = None,
    expires_at: datetime | None = None,
    starts_at: datetime | None = None,
) -> Entitlement:
    row = await db.scalar(
        select(Entitlement).where(Entitlement.source_ref == source_ref, Entitlement.key == key)
    )
    if row is None:
        row = Entitlement(
            user_id=user_id,
            key=key,
            quantity=quantity,
            source=source,
            source_ref=source_ref,
            subject_type=subject_type,
            subject_id=subject_id,
            expires_at=expires_at,
            starts_at=starts_at or now(),
        )
        db.add(row)
    elif source == "subscription":
        # Subscriptions re-assert their grants (renewal, plan or quantity change).
        row.quantity = quantity
        row.revoked_at = None
        row.expires_at = expires_at
    await db.flush()
    return row


async def revoke_source(db: AsyncSession, source_ref: str, keep: Iterable[str] = ()) -> int:
    keep = set(keep)
    rows = (
        await db.scalars(
            select(Entitlement).where(
                Entitlement.source_ref == source_ref, Entitlement.revoked_at.is_(None)
            )
        )
    ).all()
    count = 0
    for row in rows:
        if row.key not in keep:
            row.revoked_at = now()
            count += 1
    await db.flush()
    return count


async def subjects_with(db: AsyncSession, key: str, subject_ids: Iterable[str]) -> set[str]:
    ids = list(subject_ids)
    if not ids:
        return set()
    rows = await db.scalars(
        select(Entitlement.subject_id).where(
            Entitlement.key == key, Entitlement.subject_id.in_(ids), Entitlement.quantity > 0, in_force()
        )
    )
    return {r for r in rows.all() if r}


async def all_subjects(db: AsyncSession, key: str, limit: int = 50) -> list[str]:
    rows = await db.scalars(
        select(Entitlement.subject_id)
        .where(Entitlement.key == key, Entitlement.subject_id.is_not(None), Entitlement.quantity > 0, in_force())
        .order_by(Entitlement.created_at.desc())
        .limit(limit)
    )
    return [r for r in rows.all() if r]


# ── monthly allowances (free + subscription) topped up by credit packs ────────


async def usage(db: AsyncSession, user_id: uuid.UUID, kind: str, month: str | None = None) -> int:
    value = await db.scalar(
        select(CreditUsage.used).where(
            CreditUsage.user_id == user_id, CreditUsage.kind == kind, CreditUsage.month == (month or month_key())
        )
    )
    return int(value or 0)


async def bump_usage(
    db: AsyncSession, user_id: uuid.UUID, kind: str, delta: int, month: str | None = None
) -> None:
    month = month or month_key()
    row = await db.scalar(
        select(CreditUsage).where(
            CreditUsage.user_id == user_id, CreditUsage.kind == kind, CreditUsage.month == month
        )
    )
    if row is None:
        row = CreditUsage(user_id=user_id, kind=kind, month=month, used=0)
        db.add(row)
    row.used = max(0, row.used + delta)
    await db.flush()


async def monthly_status(
    db: AsyncSession, user_id: uuid.UUID, *, kind: str, free: int, monthly_key: str, pack_key: str
) -> dict[str, int]:
    included = free + await balance(db, user_id, monthly_key)
    used = await usage(db, user_id, kind)
    packs = await balance(db, user_id, pack_key)
    monthly_left = max(included - used, 0)
    return {
        "included_monthly": included,
        "used_this_month": used,
        "monthly_remaining": monthly_left,
        "pack_remaining": packs,
        "available": monthly_left + packs,
    }


async def spend_monthly(
    db: AsyncSession, user_id: uuid.UUID, *, kind: str, free: int, monthly_key: str, pack_key: str
) -> str | None:
    """Spend one: the monthly allowance first, then a pack credit.
    Returns "monthly", a pack entitlement id, or None when none are left."""
    status = await monthly_status(
        db, user_id, kind=kind, free=free, monthly_key=monthly_key, pack_key=pack_key
    )
    if status["monthly_remaining"] > 0:
        await bump_usage(db, user_id, kind, 1)
        return "monthly"
    used = await consume(db, user_id, pack_key, 1)
    return str(used[0]) if used else None


async def return_credit(
    db: AsyncSession, user_id: uuid.UUID, *, kind: str, spent: str, spent_at: datetime
) -> None:
    """Give back a credit spent by `spend_monthly`."""
    if spent == "monthly":
        await bump_usage(db, user_id, kind, -1, month_key(spent_at))
        return
    row = await db.get(Entitlement, uuid.UUID(spent))
    if row is not None:
        row.quantity += 1
        await db.flush()


def expiry(days: int | None) -> datetime | None:
    return now() + timedelta(days=days) if days else None


async def total_ad_spend(db: AsyncSession, since: datetime) -> int:
    from app.domains.billing.models import AdClick

    return int(
        await db.scalar(select(func.coalesce(func.sum(AdClick.cost_cents), 0)).where(AdClick.created_at >= since))
        or 0
    )
