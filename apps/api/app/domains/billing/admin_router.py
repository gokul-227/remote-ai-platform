"""Staff billing console: purchases, subscriptions, entitlements, refunds, prices, revenue.

Every mutation needs a reason and writes an audit event in the same
transaction. Refunds go through Stripe; the charge.refunded webhook then
updates the purchase and revokes what it granted.
"""

import uuid
from datetime import datetime, timedelta
from typing import Any

import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit_event
from app.core.config import settings
from app.core.database import get_db
from app.domains.auth.dependencies import require_role
from app.domains.auth.models import User, UserRole
from app.domains.billing import grants, placements
from app.domains.billing.models import Entitlement, Invoice, Plan, Purchase, Subscription
from app.domains.billing.router import EntitlementOut, PlanOut
from app.services.billing import stripe_gateway as gateway

router = APIRouter(prefix="/admin/billing", tags=["Admin Billing"])
staff = require_role(UserRole.ADMIN)


class Reason(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    reason: str = Field(min_length=3, max_length=1000)


class RefundIn(Reason):
    amount_cents: int | None = Field(default=None, ge=1)


class PlanPatch(Reason):
    price_cents: int | None = Field(default=None, ge=0, le=1_000_000)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None


class GrantIn(Reason):
    user_id: uuid.UUID
    key: str = Field(min_length=1, max_length=64)
    quantity: int = Field(default=1, ge=1, le=1_000_000)
    days: int | None = Field(default=None, ge=1, le=3650)
    subject_id: str | None = Field(default=None, max_length=64)


class FulfilIn(Reason):
    fulfilment_status: str = Field(pattern="^(queued|done)$")


class AdminPurchase(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID | None
    plan_slug: str
    mode: str
    status: str
    amount_total: int | None
    amount_refunded: int
    currency: str
    subject_id: str | None
    fulfilment_status: str
    stripe_payment_intent_id: str | None
    created_at: datetime
    paid_at: datetime | None


class AdminSubscription(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID
    plan_id: uuid.UUID
    status: str
    current_period_end: datetime | None
    cancel_at_period_end: bool
    stripe_subscription_id: str | None
    created_at: datetime


class AdminEntitlement(EntitlementOut):
    user_id: uuid.UUID
    source_ref: str
    revoked_at: datetime | None
    created_at: datetime


async def _audit(db: AsyncSession, admin: User, request: Request, action: str, rid: str, payload: dict) -> None:
    await record_audit_event(
        db, actor_id=admin.id, actor_role="ADMIN", request=request, action=f"admin.billing.{action}",
        resource_type="billing", resource_id=rid, payload=payload,
    )


@router.get("/purchases", response_model=list[AdminPurchase])
async def purchases(
    status: str | None = None, user_id: uuid.UUID | None = None, fulfilment: str | None = None,
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    _: User = Depends(staff), db: AsyncSession = Depends(get_db),
) -> list[AdminPurchase]:
    stmt = select(Purchase).order_by(Purchase.created_at.desc())
    if status:
        stmt = stmt.where(Purchase.status == status)
    if user_id:
        stmt = stmt.where(Purchase.user_id == user_id)
    if fulfilment:
        stmt = stmt.where(Purchase.fulfilment_status == fulfilment)
    rows = await db.scalars(stmt.offset(offset).limit(limit))
    return [AdminPurchase.model_validate(r) for r in rows.all()]


@router.get("/subscriptions", response_model=list[AdminSubscription])
async def subscriptions(
    status: str | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    _: User = Depends(staff), db: AsyncSession = Depends(get_db),
) -> list[AdminSubscription]:
    stmt = select(Subscription).order_by(Subscription.created_at.desc())
    if status:
        stmt = stmt.where(Subscription.status == status)
    rows = await db.scalars(stmt.offset(offset).limit(limit))
    return [AdminSubscription.model_validate(r) for r in rows.all()]


@router.get("/entitlements", response_model=list[AdminEntitlement])
async def entitlements(
    user_id: uuid.UUID | None = None, key: str | None = None, limit: int = Query(100, ge=1, le=500),
    _: User = Depends(staff), db: AsyncSession = Depends(get_db),
) -> list[AdminEntitlement]:
    stmt = select(Entitlement).order_by(Entitlement.created_at.desc())
    if user_id:
        stmt = stmt.where(Entitlement.user_id == user_id)
    if key:
        stmt = stmt.where(Entitlement.key == key)
    rows = await db.scalars(stmt.limit(limit))
    return [AdminEntitlement.model_validate(r) for r in rows.all()]


@router.post("/entitlements", response_model=AdminEntitlement, status_code=201)
async def grant_entitlement(
    data: GrantIn, request: Request, admin: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> AdminEntitlement:
    if await db.get(User, data.user_id) is None:
        raise HTTPException(404, "User not found")
    row = await grants.grant(
        db, user_id=data.user_id, key=data.key, quantity=data.quantity, source="staff",
        source_ref=f"staff:{uuid.uuid4()}", subject_id=data.subject_id, expires_at=grants.expiry(data.days),
    )
    await _audit(db, admin, request, "grant", str(row.id), {"reason": data.reason, "key": data.key, "user_id": str(data.user_id)})
    return AdminEntitlement.model_validate(row)


@router.post("/entitlements/{entitlement_id}/revoke", response_model=AdminEntitlement)
async def revoke_entitlement(
    entitlement_id: uuid.UUID, data: Reason, request: Request, admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> AdminEntitlement:
    row = await db.get(Entitlement, entitlement_id)
    if row is None:
        raise HTTPException(404, "Entitlement not found")
    row.revoked_at = grants.now()
    await db.flush()
    await _audit(db, admin, request, "revoke", str(row.id), {"reason": data.reason, "key": row.key})
    return AdminEntitlement.model_validate(row)


@router.post("/purchases/{purchase_id}/refund")
async def refund_purchase(
    purchase_id: uuid.UUID, data: RefundIn, request: Request, admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    purchase = await db.get(Purchase, purchase_id)
    if purchase is None:
        raise HTTPException(404, "Purchase not found")
    if purchase.status not in {"paid", "partially_refunded"} or not purchase.stripe_payment_intent_id:
        raise HTTPException(409, "Only paid purchases with a Stripe payment can be refunded here")
    try:
        result = gateway.refund(payment_intent=purchase.stripe_payment_intent_id, amount=data.amount_cents)
    except (stripe.StripeError, gateway.BillingConfigError) as exc:
        raise HTTPException(502, f"Stripe refused the refund: {type(exc).__name__}") from exc
    await _audit(db, admin, request, "refund", str(purchase.id),
                 {"reason": data.reason, "amount_cents": data.amount_cents, "refund_id": result["id"]})
    return {"refund_id": result["id"], "status": result["status"], "amount": result["amount"]}


@router.post("/purchases/{purchase_id}/fulfilment", response_model=AdminPurchase)
async def set_fulfilment(
    purchase_id: uuid.UUID, data: FulfilIn, request: Request, admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> AdminPurchase:
    purchase = await db.get(Purchase, purchase_id)
    if purchase is None:
        raise HTTPException(404, "Purchase not found")
    purchase.fulfilment_status = data.fulfilment_status
    await db.flush()
    await _audit(db, admin, request, "fulfilment", str(purchase.id), {"reason": data.reason, "status": data.fulfilment_status})
    return AdminPurchase.model_validate(purchase)


@router.get("/plans", response_model=list[PlanOut])
async def plans(_: User = Depends(staff), db: AsyncSession = Depends(get_db)) -> list[PlanOut]:
    rows = await db.scalars(select(Plan).where(Plan.mode != "free").order_by(Plan.sort_order))
    return [PlanOut.model_validate(p) for p in rows.all()]


@router.patch("/plans/{slug}", response_model=PlanOut)
async def edit_plan(
    slug: str, data: PlanPatch, request: Request, admin: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> PlanOut:
    """Edit name, description, availability or price. A new price gets a new
    Stripe Price now when Stripe is configured (existing subscribers keep
    theirs until changed in Stripe); otherwise the sync script creates it."""
    plan = await db.scalar(select(Plan).where(Plan.slug == slug))
    if plan is None or plan.mode == "free":
        raise HTTPException(404, "Plan not found")
    before = {"price_cents": plan.price_cents, "name": plan.name, "is_active": plan.is_active}
    if data.name is not None:
        plan.name = data.name
    if data.description is not None:
        plan.description = data.description
    if data.is_active is not None:
        plan.is_active = data.is_active
    if data.price_cents is not None and data.price_cents != plan.price_cents:
        plan.price_cents = data.price_cents
        plan.stripe_price_id = None
        if plan.stripe_product_id and gateway.configured():
            try:
                plan.stripe_price_id = gateway.create_price(
                    product=plan.stripe_product_id, slug=plan.slug, unit_amount=plan.price_cents,
                    currency=plan.currency, interval=None if plan.mode == "payment" else plan.billing_interval,
                )
            except stripe.StripeError as exc:
                raise HTTPException(502, "Stripe refused the new price; nothing changed") from exc
    await db.flush()
    await _audit(db, admin, request, "plan.edit", plan.slug,
                 {"reason": data.reason, "before": before, "after": data.model_dump(exclude={"reason"}, exclude_none=True)})
    return PlanOut.model_validate(plan)


@router.get("/revenue")
async def revenue(_: User = Depends(staff), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Computed only from recorded Stripe events (purchases, invoices, subscriptions, clicks)."""
    now = grants.now()
    since = now - timedelta(days=30)
    active = (
        await db.execute(
            select(Subscription, Plan).join(Plan, Plan.id == Subscription.plan_id)
            .where(Subscription.status.in_(("active", "past_due")))
        )
    ).all()
    mrr = sum(p.price_cents if p.billing_interval == "month" else round(p.price_cents / 12) for _s, p in active)
    trialing = await db.scalar(select(func.count()).select_from(Subscription).where(Subscription.status == "trialing"))
    churned = await db.scalar(
        select(func.count()).select_from(Subscription)
        .where(Subscription.status == "canceled", Subscription.updated_at >= since)
    )
    one_off = select(func.coalesce(func.sum(Purchase.amount_total - Purchase.amount_refunded), 0)).where(
        Purchase.mode == "payment", or_(Purchase.status == "paid", Purchase.status == "partially_refunded")
    )
    invoices_30 = await db.scalar(select(func.coalesce(func.sum(Invoice.amount_paid), 0)).where(Invoice.created_at >= since))
    base = len(active) + int(churned or 0)
    return {
        "currency": "eur",
        "mrr_cents": mrr,
        "active_subscriptions": len(active),
        "trialing_subscriptions": int(trialing or 0),
        "churned_30d": int(churned or 0),
        "churn_rate_30d": round(int(churned or 0) / base, 4) if base else 0.0,
        "one_off_revenue_cents_30d": int(await db.scalar(one_off.where(Purchase.paid_at >= since)) or 0),
        "one_off_revenue_cents_total": int(await db.scalar(one_off) or 0),
        "subscription_invoices_cents_30d": int(invoices_30 or 0),
        "ad_spend_cents_30d": await grants.total_ad_spend(db, since),
        "billing_enabled": settings.BILLING_ENABLED,
    }


@router.post("/messages/refund-sweep")
async def refund_sweep(
    request: Request, admin: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> dict[str, int]:
    result = await placements.refund_unanswered_messages(db)
    await _audit(db, admin, request, "messages.refund_sweep", "sweep", result)
    return result
