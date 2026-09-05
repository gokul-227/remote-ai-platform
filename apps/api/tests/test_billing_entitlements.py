"""
Tests for the billing/entitlements architecture scaffolding
(app/domains/billing/*). Architecture-only pass -- no real pricing exists
yet, so these tests exercise the fallback/resolution mechanics rather than
any specific business limit.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User
from app.domains.billing.entitlements import (
    FREE_PLAN_SLUG,
    check_entitlement,
    get_effective_plan,
    get_entitlements,
)
from app.domains.billing.models import Plan, Subscription


async def _make_plan(db: AsyncSession, slug: str, entitlements: dict) -> Plan:
    plan = Plan(
        id=uuid.uuid4(),
        name=slug.title(),
        slug=slug,
        price_cents=0,
        billing_interval="month",
        entitlements=entitlements,
        is_active=True,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def _make_subscription(
    db: AsyncSession,
    user: User,
    plan: Plan,
    status: str = "active",
    current_period_end: datetime | None = None,
) -> Subscription:
    sub = Subscription(
        id=uuid.uuid4(),
        user_id=user.id,
        plan_id=plan.id,
        status=status,
        current_period_end=current_period_end,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@pytest.mark.asyncio
async def test_no_subscription_falls_back_to_free_tier(db: AsyncSession, test_user: User):
    """With no subscription row at all, entitlements come from the seeded
    (test-created) 'free' plan."""
    await _make_plan(
        db,
        FREE_PLAN_SLUG,
        {"max_job_postings": 3, "ai_matching": True},
    )

    plan = await get_effective_plan(test_user, db)
    assert plan.slug == FREE_PLAN_SLUG

    assert await check_entitlement(test_user, "ai_matching", db) is True
    # check_entitlement always returns bool -- numeric/quota-shaped values
    # (like a job-postings limit) are read via get_entitlements() instead.
    entitlements = await get_entitlements(test_user, db)
    assert entitlements["max_job_postings"] == 3


@pytest.mark.asyncio
async def test_no_subscription_and_no_free_plan_row_uses_in_code_fallback(
    db: AsyncSession, test_user: User
):
    """Even if the 'free' plan row is missing entirely (e.g. migration not
    applied in some environment), check_entitlement must not raise -- it
    falls back to the in-code FALLBACK_FREE_ENTITLEMENTS default."""
    plan = await get_effective_plan(test_user, db)
    assert plan.slug == FREE_PLAN_SLUG
    # Should resolve without error and return a boolean either way.
    result = await check_entitlement(test_user, "ai_matching", db)
    assert isinstance(result, bool)


@pytest.mark.asyncio
async def test_active_subscription_uses_its_own_plan_entitlements(
    db: AsyncSession, test_user: User
):
    await _make_plan(db, FREE_PLAN_SLUG, {"max_job_postings": 3, "ai_matching": False})
    pro_plan = await _make_plan(
        db, "pro", {"max_job_postings": 100, "ai_matching": True, "advanced_search": True}
    )
    await _make_subscription(
        db,
        test_user,
        pro_plan,
        status="active",
        current_period_end=datetime.now(UTC) + timedelta(days=30),
    )

    plan = await get_effective_plan(test_user, db)
    assert plan.slug == "pro"
    assert await check_entitlement(test_user, "ai_matching", db) is True
    assert await check_entitlement(test_user, "advanced_search", db) is True
    entitlements = await get_entitlements(test_user, db)
    assert entitlements["max_job_postings"] == 100


@pytest.mark.asyncio
async def test_trialing_subscription_with_no_period_end_is_treated_as_current(
    db: AsyncSession, test_user: User
):
    await _make_plan(db, FREE_PLAN_SLUG, {"ai_matching": False})
    pro_plan = await _make_plan(db, "pro", {"ai_matching": True})
    await _make_subscription(db, test_user, pro_plan, status="trialing", current_period_end=None)

    assert await check_entitlement(test_user, "ai_matching", db) is True


@pytest.mark.parametrize("status", ["canceled", "past_due", "incomplete"])
@pytest.mark.asyncio
async def test_non_active_subscription_status_falls_back_to_free_tier(
    db: AsyncSession, test_user: User, status: str
):
    await _make_plan(db, FREE_PLAN_SLUG, {"ai_matching": False, "max_job_postings": 3})
    pro_plan = await _make_plan(db, "pro", {"ai_matching": True, "max_job_postings": 100})
    await _make_subscription(
        db,
        test_user,
        pro_plan,
        status=status,
        current_period_end=datetime.now(UTC) + timedelta(days=30),
    )

    plan = await get_effective_plan(test_user, db)
    assert plan.slug == FREE_PLAN_SLUG
    assert await check_entitlement(test_user, "ai_matching", db) is False
    entitlements = await get_entitlements(test_user, db)
    assert entitlements["max_job_postings"] == 3


@pytest.mark.asyncio
async def test_expired_active_subscription_falls_back_to_free_tier(
    db: AsyncSession, test_user: User
):
    """status='active' but current_period_end already in the past --
    e.g. a renewal/webhook update hasn't landed yet -- must not be treated
    as current."""
    await _make_plan(db, FREE_PLAN_SLUG, {"ai_matching": False})
    pro_plan = await _make_plan(db, "pro", {"ai_matching": True})
    await _make_subscription(
        db,
        test_user,
        pro_plan,
        status="active",
        current_period_end=datetime.now(UTC) - timedelta(days=1),
    )

    plan = await get_effective_plan(test_user, db)
    assert plan.slug == FREE_PLAN_SLUG
    assert await check_entitlement(test_user, "ai_matching", db) is False


@pytest.mark.asyncio
async def test_unknown_entitlement_key_denies_by_default(db: AsyncSession, test_user: User):
    """A key that doesn't exist on any plan's entitlements dict should be
    treated as not-entitled (fail closed), not raise or default to True."""
    await _make_plan(db, FREE_PLAN_SLUG, {"ai_matching": True})

    result = await check_entitlement(test_user, "some_feature_that_does_not_exist", db)
    assert result is False


@pytest.mark.asyncio
async def test_most_recent_subscription_wins_when_multiple_exist(
    db: AsyncSession, test_user: User
):
    """If a user somehow has more than one subscription row (e.g. an old
    canceled one plus a new active one), the most recently created current
    one should govern."""
    await _make_plan(db, FREE_PLAN_SLUG, {"ai_matching": False})
    old_plan = await _make_plan(db, "old-pro", {"ai_matching": False, "legacy": True})
    new_plan = await _make_plan(db, "new-pro", {"ai_matching": True})

    await _make_subscription(db, test_user, old_plan, status="canceled")
    await _make_subscription(
        db,
        test_user,
        new_plan,
        status="active",
        current_period_end=datetime.now(UTC) + timedelta(days=30),
    )

    plan = await get_effective_plan(test_user, db)
    assert plan.slug == "new-pro"
