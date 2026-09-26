"""Per-user and platform-wide AI token allowances.

The signed-in user (and their request's DB session) is attached to the
request context during authentication, so every AI call made while handling
that request is checked against and recorded to that user without threading
the user through every agent. Calls with no signed-in user (background jobs)
are only subject to the platform-wide daily cap when a session is known.
"""

import uuid
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.ai.models import AIUsageLog


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


async def check_ai_quota() -> None:
    actor = current_ai_actor()
    if actor is None:
        return
    if await tokens_used(actor.db, since=_day_start()) >= settings.AI_GLOBAL_DAILY_TOKENS:
        raise AIQuotaExceeded(
            "AI features have reached today's platform limit. Please try again tomorrow."
        )
    allowance = await monthly_allowance(actor)
    if allowance is not None and (
        await tokens_used(actor.db, since=_month_start(), user_id=actor.user_id) >= allowance
    ):
        raise AIQuotaExceeded(
            "You've used this month's AI allowance. It resets on the 1st of next month."
        )


async def usage_summary(actor: AIActor) -> dict[str, int | None]:
    used = await tokens_used(actor.db, since=_month_start(), user_id=actor.user_id)
    return {"used_this_month": used, "monthly_allowance": await monthly_allowance(actor)}
