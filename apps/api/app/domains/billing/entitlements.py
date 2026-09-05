"""
Entitlement-checking mechanism.

This is capability scaffolding for the future, not an active feature gate:
nothing in this codebase currently calls `require_entitlement` from an
existing endpoint. It exists so that whenever the product owner decides on
real plan names/prices/limits, gating a specific endpoint becomes a one-line
`Depends(require_entitlement("some_key"))` addition instead of a new piece of
infrastructure.

Resolution order for "what can this user do":
1. If the user has a subscription whose status is active/trialing AND whose
   `current_period_end` is either unset or still in the future, use that
   subscription's plan entitlements.
2. Otherwise (no subscription, or one that is canceled/past_due/expired),
   fall back to the seeded "free" Plan row's entitlements.
3. If even the "free" Plan row is missing (e.g. migration not yet applied
   in some environment), fall back to an in-code default so this never
   raises -- see `FALLBACK_FREE_ENTITLEMENTS` below, which is a placeholder
   pending a real product decision, same as the seeded row.
"""

from datetime import UTC, datetime
from typing import Any

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.billing.models import Plan, Subscription

FREE_PLAN_SLUG = "free"

# Placeholder values only -- NOT a product decision. These exist purely so
# `check_entitlement` has something sane to fall back to if the "free" Plan
# row seeded by the migration is ever missing. The actual free-tier limits
# live in that seeded row and should be edited there (or via an admin UI,
# once one exists), not here.
FALLBACK_FREE_ENTITLEMENTS: dict[str, Any] = {
    "max_job_postings": 3,
    "max_saved_jobs": 25,
    "ai_matching": True,
}

_ACTIVE_STATUSES = {"active", "trialing"}


def _is_subscription_current(subscription: Subscription) -> bool:
    if subscription.status not in _ACTIVE_STATUSES:
        return False
    if subscription.current_period_end is None:
        return True
    period_end = subscription.current_period_end
    if period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=UTC)
    return period_end > datetime.now(UTC)


async def get_free_plan(db: AsyncSession) -> Plan | None:
    """Returns the seeded `slug="free"` Plan row, or None if it doesn't exist."""
    return await db.scalar(select(Plan).where(Plan.slug == FREE_PLAN_SLUG))


async def get_active_subscription(user_id: Any, db: AsyncSession) -> Subscription | None:
    """
    Returns the user's current subscription if one exists and is
    active/trialing and not past its `current_period_end`, else None.
    """
    result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id)
        .order_by(Subscription.created_at.desc())
    )
    for subscription in result.scalars().all():
        if _is_subscription_current(subscription):
            return subscription
    return None


async def get_effective_plan(user: User, db: AsyncSession) -> Plan:
    """
    Resolves the Plan that should govern `user`'s entitlements right now:
    their active subscription's plan, or the free-tier plan as a fallback.
    """
    subscription = await get_active_subscription(user.id, db)
    if subscription is not None:
        plan = await db.get(Plan, subscription.plan_id)
        if plan is not None:
            return plan

    free_plan = await get_free_plan(db)
    if free_plan is not None:
        return free_plan

    # Defensive fallback only -- should not happen once the seed migration
    # has run. Constructed (not persisted) so callers still get a real Plan
    # object to read `.entitlements` off of.
    return Plan(
        name="Free (fallback)",
        slug=FREE_PLAN_SLUG,
        price_cents=0,
        billing_interval="month",
        entitlements=dict(FALLBACK_FREE_ENTITLEMENTS),
        is_active=True,
    )


async def get_entitlements(user: User, db: AsyncSession) -> dict[str, Any]:
    """Returns the full entitlements dict for `user`'s effective plan."""
    plan = await get_effective_plan(user, db)
    return dict(plan.entitlements or {})


async def check_entitlement(user: User, entitlement_key: str, db: AsyncSession) -> bool:
    """
    Returns whether `user` is entitled to `entitlement_key` under their
    effective plan (active subscription's plan, else free tier).

    An entitlement key not present in the resolved plan's entitlements dict
    is treated as `False` (deny by default) rather than raising -- callers
    gating a brand-new feature key shouldn't need every existing plan row
    updated first, and an unrecognized/typo'd key should fail closed rather
    than silently granting access.
    """
    entitlements = await get_entitlements(user, db)
    value = entitlements.get(entitlement_key, False)
    return bool(value)


def require_entitlement(entitlement_key: str):
    """
    FastAPI dependency factory for gating an endpoint behind an entitlement.
    Not currently used by any router in this pass -- see module docstring.

    Usage (future):
        @router.post("/jobs", dependencies=[Depends(require_entitlement("max_job_postings"))])
    """

    async def _dependency(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        allowed = await check_entitlement(current_user, entitlement_key, db)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    f"Your current plan does not include '{entitlement_key}'. "
                    "Upgrade your plan to access this feature."
                ),
            )
        return current_user

    return _dependency
