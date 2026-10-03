"""Per-user and platform-wide AI token allowances.

The signed-in user is attached to the request context during
authentication, so every AI call made while handling that request is
checked against and recorded to that user without threading the user
through every agent. Calls with no signed-in user are still held to the
platform-wide daily cap.

Each call first *reserves* an estimate (a RESERVED usage row, committed in
its own transaction under a lock, so concurrent calls see each other), then
*settles* it with the real token count, again in its own transaction: a
request that fails or rolls back after the call cannot erase what it spent.

Admission semantics (AI-02): a call is admitted only if what is already used
*plus its reservation* fits the cap, so a user one token below the cap is
refused rather than overshooting by a whole call. A call whose actual usage
exceeds the estimate is still recorded in full, so the caps can be exceeded by
at most (actual - estimate) per call in flight. A reservation that is never
settled (process crash) keeps counting its estimate. These are token
allowances, not a guarantee of zero paid usage or a financial cap.
"""

import uuid
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import database
from app.core.config import settings
from app.services.ai.models import AIUsageLog

# Serialises the check-and-reserve step (milliseconds, not the AI call itself).
_RESERVE_LOCK_KEY = 7_241_093_552


@dataclass(frozen=True)
class AIActor:
    user_id: uuid.UUID
    db: AsyncSession
    unlimited: bool = False


_actor: ContextVar[AIActor | None] = ContextVar("ai_actor", default=None)


def set_ai_actor(user_id: uuid.UUID, db: AsyncSession, *, unlimited: bool = False) -> None:
    _actor.set(AIActor(user_id=user_id, db=db, unlimited=unlimited))


def current_ai_actor() -> AIActor | None:
    return _actor.get()


class AIQuotaExceeded(Exception):  # noqa: N818
    """The user's monthly AI allowance (or the platform's daily cap) is used up."""


def _month_start() -> datetime:
    now = datetime.now(UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _day_start() -> datetime:
    return datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


async def tokens_used(db: AsyncSession, *, since: datetime, user_id: uuid.UUID | None = None) -> int:
    stmt = select(func.coalesce(func.sum(AIUsageLog.total_tokens), 0)).where(
        AIUsageLog.created_at >= since
    )
    if user_id is not None:
        stmt = stmt.where(AIUsageLog.user_id == user_id)
    return int(await db.scalar(stmt) or 0)


async def monthly_allowance(actor: AIActor) -> int | None:
    """None means unlimited (administrators)."""
    if actor.unlimited:
        return None
    return settings.AI_FREE_MONTHLY_TOKENS


async def reserve_ai_tokens(prompt_key: str | None = None, prompt_version: str | None = None) -> uuid.UUID:
    """Check the platform cap (always) and the caller's allowance, then commit a
    RESERVED usage row for an estimate. Returns the reservation to settle."""
    actor = current_ai_actor()
    user_id = actor.user_id if actor else None
    async with database.AsyncSessionFactory() as db:
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            await db.execute(text(f"SELECT pg_advisory_xact_lock({_RESERVE_LOCK_KEY})"))
        estimate = settings.AI_RESERVATION_TOKENS
        if await tokens_used(db, since=_day_start()) + estimate > settings.AI_GLOBAL_DAILY_TOKENS:
            raise AIQuotaExceeded(
                "AI features have reached today's platform limit. Please try again tomorrow."
            )
        allowance = await monthly_allowance(actor) if actor else None
        if allowance is not None and (
            await tokens_used(db, since=_month_start(), user_id=user_id) + estimate > allowance
        ):
            raise AIQuotaExceeded(
                "You've used this month's AI allowance. It resets on the 1st of next month."
            )
        row = AIUsageLog(
            user_id=user_id,
            prompt_key=prompt_key,
            prompt_version=prompt_version,
            status="RESERVED",
            total_tokens=estimate,
        )
        db.add(row)
        await db.commit()
        return row.id


async def settle_ai_tokens(reservation_id: uuid.UUID, **fields: object) -> None:
    """Replace a reservation's estimate with what the call actually used."""
    async with database.AsyncSessionFactory() as db:
        row = await db.get(AIUsageLog, reservation_id)
        if row is None:
            return
        for key, value in fields.items():
            setattr(row, key, value)
        await db.commit()


async def usage_summary(actor: AIActor) -> dict[str, int | None]:
    used = await tokens_used(actor.db, since=_month_start(), user_id=actor.user_id)
    return {"used_this_month": used, "monthly_allowance": await monthly_allowance(actor)}
