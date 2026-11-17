"""Billing API: catalogue, checkout, portal, my billing, placements and credits.

Checkout, portal and every spend endpoint answer 404 while BILLING_ENABLED is
off. The catalogue and placements stay readable (placements are empty), so
the pricing page can say "coming soon" from real data.
"""

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.schemas import HttpUrlIn
from app.domains.auth.dependencies import get_current_user, get_optional_user
from app.domains.auth.models import User
from app.domains.billing import grants, placements, service, team
from app.domains.billing.models import (
    Entitlement,
    Invoice,
    Plan,
    Purchase,
    SponsoredCampaign,
    Subscription,
)
from app.domains.jobs.schemas import JobPostResponse
from app.services.billing.stripe_gateway import require_billing_enabled

router = APIRouter(prefix="/billing", tags=["Billing"])
enabled = [Depends(require_billing_enabled)]


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    slug: str
    name: str
    description: str | None
    audience: str
    mode: str
    price_cents: int
    currency: str
    billing_interval: str
    duration_days: int | None
    target: str | None
    trial_days: int | None
    is_active: bool
    entitlements: dict[str, Any]


class CatalogOut(BaseModel):
    enabled: bool
    currency: str = "eur"
    prices_include_vat: bool = True
    # False: prices are final gross amounts; no tax is calculated at checkout.
    tax_calculated: bool = False
    items: list[PlanOut]


class CheckoutIn(BaseModel):
    plan: str = Field(min_length=1, max_length=100)
    subject_id: str | None = Field(default=None, max_length=64)
    quantity: int = Field(default=1, ge=1, le=50)


class UrlOut(BaseModel):
    url: str


class EntitlementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    key: str
    quantity: int
    subject_type: str | None
    subject_id: str | None
    source: str
    expires_at: datetime | None


class SubscriptionOut(BaseModel):
    id: uuid.UUID
    plan: str
    plan_name: str
    status: str
    current_period_end: datetime | None
    cancel_at_period_end: bool


class PurchaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    plan_slug: str
    status: str
    amount_total: int | None
    amount_refunded: int
    currency: str
    subject_id: str | None
    fulfilment_status: str
    created_at: datetime
    paid_at: datetime | None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    amount_paid: int
    currency: str
    status: str
    hosted_invoice_url: str | None
    invoice_pdf: str | None
    period_start: datetime | None
    period_end: datetime | None
    created_at: datetime


class MyBilling(BaseModel):
    enabled: bool
    has_customer: bool
    entitlements: list[EntitlementOut]
    subscriptions: list[SubscriptionOut]
    purchases: list[PurchaseOut]
    invoices: list[InvoiceOut]
    balances: dict[str, Any]


class PlacementJob(BaseModel):
    label: str
    campaign_id: uuid.UUID | None = None
    job: JobPostResponse


class Placements(BaseModel):
    featured: list[PlacementJob]
    sponsored: list[PlacementJob]


class CampaignIn(BaseModel):
    job_id: uuid.UUID
    daily_budget_cents: int = Field(ge=100, le=100_000)
    max_cpc_cents: int | None = Field(default=None, ge=10, le=10_000)


class CampaignPatch(BaseModel):
    status: str | None = Field(default=None, pattern="^(active|paused)$")
    daily_budget_cents: int | None = Field(default=None, ge=100, le=100_000)
    max_cpc_cents: int | None = Field(default=None, ge=10, le=10_000)


class CampaignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    job_id: uuid.UUID
    daily_budget_cents: int
    max_cpc_cents: int
    status: str
    spent_cents: int
    created_at: datetime


class MessageSpendIn(BaseModel):
    recipient_id: uuid.UUID


class CodeIn(BaseModel):
    code: str = Field(min_length=4, max_length=16)


class BadgesIn(BaseModel):
    user_ids: list[uuid.UUID] = Field(max_length=100)


@router.get("/catalog", response_model=CatalogOut)
async def catalog(db: AsyncSession = Depends(get_db)) -> CatalogOut:
    plans = await service.sellable_plans(db)
    return CatalogOut(enabled=settings.BILLING_ENABLED, tax_calculated=settings.STRIPE_TAX_ENABLED, items=[PlanOut.model_validate(p) for p in plans])


@router.post("/checkout", response_model=UrlOut, dependencies=enabled)
async def checkout(
    data: CheckoutIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> UrlOut:
    result = await service.start_checkout(db, user, data.plan, data.subject_id, data.quantity)
    return UrlOut(url=result["url"])


@router.post("/portal", response_model=UrlOut, dependencies=enabled)
async def portal(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> UrlOut:
    return UrlOut(url=await service.portal_url(db, user))


async def _balances(db: AsyncSession, user_id: uuid.UUID) -> dict[str, Any]:
    return {
        "featured_job_credits": await grants.balance(db, user_id, "featured_job_credits"),
        "ad_balance_cents": await grants.balance(db, user_id, "ad_balance_cents"),
        "ai_tokens": await grants.balance(db, user_id, "ai_tokens"),
        "proposals": await placements.proposals_status(db, user_id),
        "messaging": await placements.messaging_status(db, user_id),
    }


@router.get("/me", response_model=MyBilling)
async def my_billing(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> MyBilling:
    from app.domains.billing.models import BillingCustomer

    ents = (await db.scalars(select(Entitlement).where(Entitlement.user_id == user.id, grants.in_force()))).all()
    subs = (
        await db.execute(
            select(Subscription, Plan)
            .join(Plan, Plan.id == Subscription.plan_id)
            .where(Subscription.user_id == user.id)
            .order_by(Subscription.created_at.desc())
        )
    ).all()
    purchases = (
        await db.scalars(
            select(Purchase).where(Purchase.user_id == user.id, Purchase.status != "pending")
            .order_by(Purchase.created_at.desc()).limit(100)
        )
    ).all()
    invoices = (
        await db.scalars(select(Invoice).where(Invoice.user_id == user.id).order_by(Invoice.created_at.desc()).limit(100))
    ).all()
    return MyBilling(
        enabled=settings.BILLING_ENABLED,
        has_customer=await db.get(BillingCustomer, user.id) is not None,
        entitlements=[EntitlementOut.model_validate(e) for e in ents if e.quantity > 0],
        subscriptions=[
            SubscriptionOut(
                id=s.id, plan=p.slug, plan_name=p.name, status=s.status,
                current_period_end=s.current_period_end, cancel_at_period_end=s.cancel_at_period_end,
            )
            for s, p in subs
        ],
        purchases=[PurchaseOut.model_validate(p) for p in purchases],
        invoices=[InvoiceOut.model_validate(i) for i in invoices],
        balances=await _balances(db, user.id),
    )


async def _own_job(db: AsyncSession, user: User, job_id: uuid.UUID) -> None:
    plan = Plan(name="job", slug="_", target="job")
    await service._check_subject(db, user, plan, str(job_id))


@router.post("/jobs/{job_id}/feature", response_model=EntitlementOut, dependencies=enabled)
async def feature_job(
    job_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> EntitlementOut:
    """Feature one of your jobs for 30 days: free while on Hire/Hire Pro, else one job-pack credit."""
    await _own_job(db, user, job_id)
    if await grants.has_entitlement(db, user.id, "featured_job", str(job_id)):
        raise HTTPException(409, "This job is already featured")
    subscribed = await grants.has_entitlement(db, user.id, "featured_eligible_posts")
    if subscribed:
        subs = await grants.active(db, user.id, "featured_eligible_posts")
        # 30 days, renewable while subscribed; the ref is per job and month so it can be renewed.
        ref = f"{subs[0].source_ref}:feature:{job_id}:{grants.month_key()}"
        source, expires = "plan", grants.expiry(30)
    else:
        used = await grants.consume(db, user.id, "featured_job_credits", 1)
        if not used:
            raise HTTPException(402, "Buy a Featured job, a job pack or a Hire plan to feature this job")
        ref, source, expires = f"credit:{used[0]}:{job_id}", "purchase", grants.expiry(30)
    row = await grants.grant(
        db, user_id=user.id, key="featured_job", quantity=1, source=source, source_ref=ref,
        subject_type="job", subject_id=str(job_id), expires_at=expires,
    )
    return EntitlementOut.model_validate(row)


@router.get("/placements/jobs", response_model=Placements)
async def placement_jobs(limit: int = Query(3, ge=1, le=10), db: AsyncSession = Depends(get_db)) -> Placements:
    data = await placements.placement_jobs(db, limit)
    return Placements(
        featured=[PlacementJob(label=i["label"], job=JobPostResponse.model_validate(i["job"])) for i in data["featured"]],
        sponsored=[
            PlacementJob(label=i["label"], campaign_id=i["campaign_id"], job=JobPostResponse.model_validate(i["job"]))
            for i in data["sponsored"]
        ],
    )


@router.post("/placements/sponsored/{campaign_id}/click")
async def sponsored_click(
    campaign_id: uuid.UUID,
    request: Request,
    viewer: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if not settings.BILLING_ENABLED:
        return {"charged": False, "reason": "disabled"}
    ip = request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "")
    visitor = str(viewer.id) if viewer else f"{ip}|{request.headers.get('user-agent', '')}"
    return await placements.record_click(
        db, campaign_id, visitor=visitor, user_agent=request.headers.get("user-agent"),
        viewer_id=viewer.id if viewer else None,
    )


@router.get("/placements/profiles", response_model=list[str])
async def promoted_profiles(db: AsyncSession = Depends(get_db)) -> list[str]:
    """Engineer profile ids with an active Profile boost, shown labelled "Promoted"."""
    return await placements.promoted_profile_ids(db)


@router.get("/sponsored", response_model=list[CampaignOut])
async def my_campaigns(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[CampaignOut]:
    rows = await db.scalars(select(SponsoredCampaign).where(SponsoredCampaign.user_id == user.id))
    return [CampaignOut.model_validate(c) for c in rows.all()]


@router.post("/sponsored", response_model=CampaignOut, status_code=201, dependencies=enabled)
async def create_campaign(
    data: CampaignIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> CampaignOut:
    await _own_job(db, user, data.job_id)
    if await db.scalar(select(SponsoredCampaign.id).where(SponsoredCampaign.job_id == data.job_id)):
        raise HTTPException(409, "This job already has a campaign")
    c = SponsoredCampaign(
        user_id=user.id, job_id=data.job_id, daily_budget_cents=data.daily_budget_cents,
        max_cpc_cents=data.max_cpc_cents or settings.BILLING_SPONSORED_DEFAULT_CPC_CENTS,
    )
    if c.max_cpc_cents > c.daily_budget_cents:
        raise HTTPException(422, "The cost per click can't exceed the daily budget")
    if await grants.balance(db, user.id, "ad_balance_cents") < c.max_cpc_cents:
        c.status = "exhausted"
    db.add(c)
    await db.flush()
    return CampaignOut.model_validate(c)


@router.patch("/sponsored/{campaign_id}", response_model=CampaignOut, dependencies=enabled)
async def update_campaign(
    campaign_id: uuid.UUID, data: CampaignPatch, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CampaignOut:
    c = await db.get(SponsoredCampaign, campaign_id)
    if c is None or c.user_id != user.id:
        raise HTTPException(404, "Campaign not found")
    for field in ("daily_budget_cents", "max_cpc_cents", "status"):
        value = getattr(data, field)
        if value is not None:
            setattr(c, field, value)
    if c.status == "active" and await grants.balance(db, user.id, "ad_balance_cents") < c.max_cpc_cents:
        c.status = "exhausted"
    await db.flush()
    return CampaignOut.model_validate(c)


@router.get("/candidates")
async def candidate_search(
    q: str | None = Query(None, max_length=100),
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Candidate database (Hire Pro or the add-on): only public profiles open to opportunities."""
    require_billing_enabled()
    if not await grants.has_entitlement(db, user.id, "candidate_search"):
        raise HTTPException(402, "Candidate search is part of Hire Pro or the Candidate database add-on")
    from app.domains.engineers.models import EngineerProfile

    stmt = select(EngineerProfile).where(
        EngineerProfile.is_public.is_(True), EngineerProfile.is_open_to_work.is_(True)
    )
    if q:
        like = f"%{q}%"
        stmt = stmt.where(EngineerProfile.headline.ilike(like) | EngineerProfile.primary_role.ilike(like))
    rows = (await db.scalars(stmt.order_by(EngineerProfile.updated_at.desc()).limit(limit))).all()
    return [
        {"id": str(p.id), "user_id": str(p.user_id), "headline": p.headline, "primary_role": p.primary_role,
         "location": p.location, "years_of_experience": p.years_of_experience}
        for p in rows
    ]


@router.post("/messages/spend", dependencies=enabled)
async def spend_message_credit(
    data: MessageSpendIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """Spend one messaging credit on a first message to a member (returned if no reply in 14 days)."""
    if data.recipient_id == user.id:
        raise HTTPException(422, "You can't message yourself")
    row = await placements.spend_message_credit(db, user.id, data.recipient_id)
    if row is None:
        raise HTTPException(402, "No messaging credits left")
    return {"spend_id": str(row.id), "balance": await placements.messaging_status(db, user.id)}


@router.get("/referral")
async def my_referral(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return {
        "code": await service.referral_code(db, user.id),
        "credit_cents": settings.BILLING_REFERRAL_CREDIT_CENTS,
        "enabled": settings.BILLING_ENABLED,
    }


@router.post("/referral/claim", dependencies=enabled)
async def claim_referral(
    data: CodeIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, bool]:
    await service.claim_referral(db, user, data.code)
    return {"ok": True}


@router.post("/badges")
async def badges(
    data: BadgesIn, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, list[str]]:
    """Premium and priority-applicant flags for members (shown to employers, always labelled)."""
    if not settings.BILLING_ENABLED or not data.user_ids:
        return {}
    rows = await db.execute(
        select(Entitlement.user_id, Entitlement.key).where(
            Entitlement.user_id.in_(data.user_ids),
            Entitlement.key.in_(("premium_badge", "priority_applicant", "verified_badge")),
            Entitlement.quantity > 0,
            grants.in_force(),
        )
    )
    out: dict[str, list[str]] = {}
    for uid, key in rows.all():
        out.setdefault(str(uid), [])
        if key not in out[str(uid)]:
            out[str(uid)].append(key)
    return out


# ── employer branding (paid; shown on the company page while entitled) ──────


class TestimonialIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    author_name: str = Field(min_length=1, max_length=120)
    author_title: str | None = Field(default=None, max_length=160)
    quote: str = Field(min_length=1, max_length=1000)
    sort_order: int = Field(default=0, ge=0, le=1000)


class TestimonialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    author_name: str
    author_title: str | None
    quote: str
    sort_order: int


class BrandingIn(BaseModel):
    cover_video_url: HttpUrlIn = None


class BrandingOut(BaseModel):
    enabled: bool
    cover_video_url: str | None = None
    testimonials: list[TestimonialOut] = []


async def _my_company(db: AsyncSession, user: User) -> Any:
    from app.domains.companies.models import CompanyProfile

    company = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == user.id))
    if company is None:
        raise HTTPException(404, "Create your company profile first")
    return company


async def _branding(db: AsyncSession, company: Any, force: bool = False) -> BrandingOut:
    from app.domains.companies.models import CompanyTestimonial

    enabled = await team.branding_enabled(db, company.user_id)
    if not force and not enabled:
        return BrandingOut(enabled=False)
    rows = await db.scalars(
        select(CompanyTestimonial)
        .where(CompanyTestimonial.company_id == company.id)
        .order_by(CompanyTestimonial.sort_order, CompanyTestimonial.created_at)
    )
    return BrandingOut(
        enabled=enabled,
        cover_video_url=company.cover_video_url,
        testimonials=[TestimonialOut.model_validate(t) for t in rows.all()],
    )


async def _require_branding(db: AsyncSession, user: User) -> Any:
    company = await _my_company(db, user)
    if not await team.branding_enabled(db, user.id):
        raise HTTPException(402, "Employer branding is a paid add-on; see Settings > Billing")
    return company


@router.get("/branding/me", response_model=BrandingOut)
async def my_branding(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> BrandingOut:
    return await _branding(db, await _my_company(db, user), force=True)


@router.get("/branding/{company_id}", response_model=BrandingOut)
async def company_branding(company_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> BrandingOut:
    """Public: the cover video and testimonials, only while the company is entitled."""
    from app.domains.companies.models import CompanyProfile

    company = await db.get(CompanyProfile, company_id)
    if company is None:
        raise HTTPException(404, "Company not found")
    return await _branding(db, company)


@router.put("/branding/me", response_model=BrandingOut)
async def set_branding(
    data: BrandingIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> BrandingOut:
    company = await _require_branding(db, user)
    company.cover_video_url = data.cover_video_url
    await db.flush()
    return await _branding(db, company, force=True)


@router.post("/branding/me/testimonials", response_model=TestimonialOut, status_code=201)
async def add_testimonial(
    data: TestimonialIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> TestimonialOut:
    from app.domains.companies.models import CompanyTestimonial

    company = await _require_branding(db, user)
    count = await db.scalar(
        select(func.count()).select_from(CompanyTestimonial).where(CompanyTestimonial.company_id == company.id)
    )
    if (count or 0) >= 20:
        raise HTTPException(409, "Up to 20 testimonials")
    row = CompanyTestimonial(company_id=company.id, **data.model_dump())
    db.add(row)
    await db.flush()
    return TestimonialOut.model_validate(row)


async def _own_testimonial(db: AsyncSession, user: User, testimonial_id: uuid.UUID) -> Any:
    from app.domains.companies.models import CompanyTestimonial

    company = await _require_branding(db, user)
    row = await db.get(CompanyTestimonial, testimonial_id)
    if row is None or row.company_id != company.id:
        raise HTTPException(404, "Testimonial not found")
    return row


@router.put("/branding/me/testimonials/{testimonial_id}", response_model=TestimonialOut)
async def edit_testimonial(
    testimonial_id: uuid.UUID, data: TestimonialIn, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TestimonialOut:
    row = await _own_testimonial(db, user, testimonial_id)
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    await db.flush()
    return TestimonialOut.model_validate(row)


@router.delete("/branding/me/testimonials/{testimonial_id}", status_code=204)
async def delete_testimonial(
    testimonial_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> None:
    row = await _own_testimonial(db, user, testimonial_id)
    await db.delete(row)
    await db.flush()


@router.get("/messages/quote")
async def message_quote(
    recipient_id: uuid.UUID,
    conversation_id: uuid.UUID | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """For the composer: whether sending uses a messaging credit, and the balance."""
    required = await team.message_credit_needed(db, user.id, recipient_id, conversation_id)
    available = (await placements.messaging_status(db, user.id))["available"] if required else None
    return {"required": required, "available": available}
