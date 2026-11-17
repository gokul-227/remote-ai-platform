"""Paid placements: featured and sponsored jobs, promoted profiles, and the
credit-metered features (messaging credits, proposals, AI packs).

Every placement is returned with an explicit label ("Featured", "Sponsored",
"Promoted") that the UI must show; organic results are never reordered.
"""

import hashlib
import hmac
import re
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domains.billing import grants
from app.domains.billing.models import AdClick, MessageCreditSpend, SponsoredCampaign

BOT_UA = re.compile(r"bot|crawl|spider|slurp|preview|headless|curl|wget|python|httpx|scrapy|monitor", re.I)
JOB_LABELS = {"featured_job": "featured", "urgent_badge": "urgent"}


def _today() -> str:
    return grants.now().strftime("%Y-%m-%d")


async def job_promotions(db: AsyncSession, job_ids: list[str]) -> dict[str, list[str]]:
    """{job_id: ["featured", "urgent", "sponsored"]} for the given jobs."""
    out: dict[str, list[str]] = {}
    if not settings.BILLING_ENABLED or not job_ids:
        return out
    for key, label in JOB_LABELS.items():
        for jid in await grants.subjects_with(db, key, job_ids):
            out.setdefault(jid, []).append(label)
    return out


async def campaign_spent_today(db: AsyncSession, campaign_id: uuid.UUID) -> int:
    return int(
        await db.scalar(
            select(func.coalesce(func.sum(AdClick.cost_cents), 0)).where(
                AdClick.campaign_id == campaign_id, AdClick.day == _today()
            )
        )
        or 0
    )


async def campaign_can_serve(db: AsyncSession, c: SponsoredCampaign) -> bool:
    if c.status != "active":
        return False
    if await grants.balance(db, c.user_id, "ad_balance_cents") < c.max_cpc_cents:
        return False
    return await campaign_spent_today(db, c.id) + c.max_cpc_cents <= c.daily_budget_cents


async def placement_jobs(db: AsyncSession, limit: int = 3) -> dict[str, list[dict[str, Any]]]:
    from app.domains.jobs.models import JobPost

    empty: dict[str, list[dict[str, Any]]] = {"featured": [], "sponsored": []}
    if not settings.BILLING_ENABLED:
        return empty
    live = and_(JobPost.is_active.is_(True), JobPost.is_deleted.is_(False), JobPost.expired_at.is_(None))
    featured_ids = await grants.all_subjects(db, "featured_job", limit=limit * 4)
    featured: list[dict[str, Any]] = []
    if featured_ids:
        rows = await db.scalars(
            select(JobPost).where(JobPost.id.in_([uuid.UUID(i) for i in featured_ids]), live)
        )
        featured = [{"job": j, "label": "Featured"} for j in rows.all()][:limit]
    sponsored: list[dict[str, Any]] = []
    campaigns = (
        await db.scalars(
            select(SponsoredCampaign)
            .where(SponsoredCampaign.status == "active")
            .order_by(SponsoredCampaign.max_cpc_cents.desc(), SponsoredCampaign.created_at)
            .limit(50)
        )
    ).all()
    for c in campaigns:
        if len(sponsored) >= limit:
            break
        if not await campaign_can_serve(db, c):
            continue
        job = await db.scalar(select(JobPost).where(JobPost.id == c.job_id, live))
        if job is not None:
            sponsored.append({"job": job, "label": "Sponsored", "campaign_id": c.id})
    return {"featured": featured, "sponsored": sponsored}


def click_fingerprint(campaign_id: uuid.UUID, visitor: str, day: str) -> str:
    secret = (settings.STRIPE_WEBHOOK_SECRET or settings.SUPABASE_URL or "rap").encode()
    return hmac.new(secret, f"{campaign_id}|{visitor}|{day}".encode(), hashlib.sha256).hexdigest()


async def record_click(
    db: AsyncSession,
    campaign_id: uuid.UUID,
    *,
    visitor: str,
    user_agent: str | None,
    viewer_id: uuid.UUID | None,
) -> dict[str, Any]:
    """Charge one click unless it is a bot, a duplicate (same visitor, campaign
    and day), the advertiser themself, or over budget. Returns what happened."""
    c = await db.get(SponsoredCampaign, campaign_id)
    if c is None or c.status != "active":
        return {"charged": False, "reason": "inactive"}
    if not user_agent or BOT_UA.search(user_agent):
        return {"charged": False, "reason": "bot"}
    if viewer_id is not None and viewer_id == c.user_id:
        return {"charged": False, "reason": "own"}
    day = _today()
    if await campaign_spent_today(db, c.id) + c.max_cpc_cents > c.daily_budget_cents:
        return {"charged": False, "reason": "daily_budget"}
    fp = click_fingerprint(c.id, visitor, day)
    try:
        async with db.begin_nested():
            db.add(AdClick(campaign_id=c.id, fingerprint=fp, day=day, cost_cents=c.max_cpc_cents))
            await db.flush()
    except IntegrityError:
        return {"charged": False, "reason": "duplicate"}
    if not await grants.consume(db, c.user_id, "ad_balance_cents", c.max_cpc_cents):
        # Balance ran out between serving and clicking: undo the click, stop the campaign.
        click = await db.scalar(select(AdClick).where(AdClick.campaign_id == c.id, AdClick.fingerprint == fp))
        if click is not None:
            await db.delete(click)
        c.status = "exhausted"
        await db.flush()
        return {"charged": False, "reason": "exhausted"}
    c.spent_cents += c.max_cpc_cents
    if await grants.balance(db, c.user_id, "ad_balance_cents") < c.max_cpc_cents:
        c.status = "exhausted"
    await db.flush()
    return {"charged": True, "cost_cents": c.max_cpc_cents}


async def promoted_profile_ids(db: AsyncSession, limit: int = 3) -> list[str]:
    if not settings.BILLING_ENABLED:
        return []
    return (await grants.all_subjects(db, "profile_boost", limit=limit))[:limit]


# ── messaging credits (InMail-style) ────────────────────────────────────────


MESSAGING = {"kind": "messaging", "free": 0, "monthly_key": "messaging_credits_monthly", "pack_key": "messaging_credits"}
PROPOSALS_KW = {"kind": "proposals", "monthly_key": "proposals_monthly", "pack_key": "proposal_credits"}


async def messaging_status(db: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    return await grants.monthly_status(db, user_id, **MESSAGING)  # type: ignore[arg-type]


async def proposals_status(db: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    return await grants.monthly_status(
        db, user_id, free=settings.BILLING_FREE_PROPOSALS_MONTHLY, **PROPOSALS_KW
    )


async def spend_proposal(db: AsyncSession, user_id: uuid.UUID) -> str | None:
    return await grants.spend_monthly(
        db, user_id, free=settings.BILLING_FREE_PROPOSALS_MONTHLY, **PROPOSALS_KW
    )


async def spend_message_credit(
    db: AsyncSession, user_id: uuid.UUID, recipient_id: uuid.UUID
) -> MessageCreditSpend | None:
    spent = await grants.spend_monthly(db, user_id, **MESSAGING)  # type: ignore[arg-type]
    if spent is None:
        return None
    row = MessageCreditSpend(
        user_id=user_id,
        recipient_id=recipient_id,
        entitlement_id=None if spent == "monthly" else uuid.UUID(spent),
        spent_at=grants.now(),
    )
    db.add(row)
    await db.flush()
    return row


async def refund_unanswered_messages(db: AsyncSession) -> dict[str, int]:
    """Return credits for first messages with no reply after BILLING_MESSAGE_REFUND_DAYS."""
    from sqlalchemy import or_

    from app.domains.network.models import Conversation, Message

    cutoff = grants.now() - timedelta(days=settings.BILLING_MESSAGE_REFUND_DAYS)
    rows = (
        await db.scalars(
            select(MessageCreditSpend).where(
                MessageCreditSpend.refunded_at.is_(None),
                MessageCreditSpend.replied_at.is_(None),
                MessageCreditSpend.spent_at < cutoff,
            )
        )
    ).all()
    refunded = replied = 0
    for spend in rows:
        reply = await db.scalar(
            select(Message.created_at)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(
                Message.sender_id == spend.recipient_id,
                Message.created_at >= spend.spent_at,
                or_(
                    and_(Conversation.participant_one_id == spend.user_id, Conversation.participant_two_id == spend.recipient_id),
                    and_(Conversation.participant_two_id == spend.user_id, Conversation.participant_one_id == spend.recipient_id),
                ),
            )
            .limit(1)
        )
        if reply is not None:
            spend.replied_at = reply
            replied += 1
            continue
        await grants.return_credit(
            db,
            spend.user_id,
            kind="messaging",
            spent="monthly" if spend.entitlement_id is None else str(spend.entitlement_id),
            spent_at=spend.spent_at,
        )
        spend.refunded_at = grants.now()
        refunded += 1
    await db.flush()
    return {"refunded": refunded, "replied": replied}


# ── AI credit packs (on top of the monthly allowance) ───────────────────────


async def ai_allowance(db: AsyncSession, user_id: uuid.UUID, base: int) -> int:
    """Monthly allowance x Premium multiplier, plus unused pack tokens and the
    pack tokens already drawn this month."""
    multiplier = max(await grants.max_value(db, user_id, "ai_allowance_multiplier"), 1)
    packs = await grants.balance(db, user_id, "ai_tokens")
    drawn = await grants.usage(db, user_id, "ai_pack_tokens")
    return base * multiplier + packs + drawn


async def draw_ai_packs(db: AsyncSession, user_id: uuid.UUID, base: int, used_this_month: int) -> int:
    """Move usage beyond the monthly allowance onto pack tokens. Returns tokens drawn."""
    multiplier = max(await grants.max_value(db, user_id, "ai_allowance_multiplier"), 1)
    drawn = await grants.usage(db, user_id, "ai_pack_tokens")
    overflow = used_this_month - base * multiplier - drawn
    if overflow <= 0:
        return 0
    take = min(overflow, await grants.balance(db, user_id, "ai_tokens"))
    if take <= 0:
        return 0
    await grants.consume(db, user_id, "ai_tokens", take)
    await grants.bump_usage(db, user_id, "ai_pack_tokens", take)
    return take
