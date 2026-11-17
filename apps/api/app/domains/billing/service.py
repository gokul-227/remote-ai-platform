"""Checkout, Stripe event handling and fulfilment for paid features.

Stripe events arrive through the existing signed receiver at
POST /api/v1/payments/webhooks/stripe (deduplicated there by event id) and
are passed to `handle_event`. Every handler is also idempotent on its own
(unique session / invoice ids, grants keyed by source), so a replay that
slipped past the dedup ledger changes nothing.
"""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import stripe
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.domains.auth.models import User
from app.domains.billing import grants
from app.domains.billing.models import (
    BillingCustomer,
    Invoice,
    Plan,
    Purchase,
    Referral,
    ReferralCode,
    Subscription,
)
from app.services.billing import stripe_gateway as gateway

logger = get_logger("billing.service")

BILLING_EVENTS = frozenset(
    {
        "checkout.session.completed",
        "checkout.session.expired",
        "invoice.paid",
        "invoice.payment_failed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "charge.refunded",
    }
)
# Subscription statuses that keep entitlements (past_due: Stripe is retrying).
KEEP_STATUSES = {"active", "trialing", "past_due"}
WAIVER_TEXT = (
    "You ask us to start this digital service now and acknowledge that you lose your 14-day "
    "right of withdrawal once it has been fully provided. Subscriptions can be cancelled at any time."
)


def _ts(value: Any) -> datetime | None:
    return datetime.fromtimestamp(int(value), UTC) if value else None


def _web(path: str) -> str:
    base = (settings.FRONTEND_URL or "https://remoteaiplatform.com").rstrip("/")
    return f"{base}{path}"


async def plan_by_slug(db: AsyncSession, slug: str) -> Plan | None:
    return await db.scalar(select(Plan).where(Plan.slug == slug))


async def sellable_plans(db: AsyncSession) -> list[Plan]:
    rows = await db.scalars(select(Plan).where(Plan.mode != "free").order_by(Plan.sort_order, Plan.slug))
    return list(rows.all())


async def customer_for(db: AsyncSession, user: User) -> BillingCustomer:
    row = await db.get(BillingCustomer, user.id)
    if row is None:
        cid = gateway.create_customer(email=user.email, name=user.full_name, user_id=str(user.id))
        row = BillingCustomer(user_id=user.id, stripe_customer_id=cid)
        db.add(row)
        await db.flush()
    return row


async def _check_subject(db: AsyncSession, user: User, plan: Plan, subject_id: str | None) -> str | None:
    if plan.target is None:
        return None
    if plan.target == "job":
        if not subject_id:
            raise HTTPException(422, f"{plan.name} needs a job to apply to")
        from app.domains.companies.models import CompanyProfile
        from app.domains.jobs.models import JobPost

        try:
            job = await db.get(JobPost, uuid.UUID(subject_id))
        except ValueError as exc:
            raise HTTPException(422, "Invalid job id") from exc
        company = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == user.id))
        if job is None or company is None or job.company_id != company.id or job.is_deleted:
            raise HTTPException(404, "Job post not found")
        return str(job.id)
    if plan.target == "profile":
        from app.domains.engineers.models import EngineerProfile

        profile = await db.scalar(select(EngineerProfile).where(EngineerProfile.user_id == user.id))
        if profile is None:
            raise HTTPException(409, "Create your profile first")
        return str(profile.id)
    raise HTTPException(422, "Unsupported target")


def _session_with_tax_fallback(params: dict[str, Any]) -> dict[str, Any]:
    """With STRIPE_TAX_ENABLED, Stripe Tax is on; if the account has no active
    Stripe Tax, retry without it (prices are tax-inclusive) and alert the owner.
    Without it, the session is created as given (no tax requested, no retry)."""
    if "automatic_tax" not in params:
        return gateway.create_checkout_session(params)
    try:
        return gateway.create_checkout_session(params)
    except stripe.InvalidRequestError as exc:
        message = str(exc).lower()
        if "tax" not in message:
            raise
        logger.warning("Stripe Tax unavailable; checkout without automatic tax", error=str(exc)[:200])
        from app.services import slack

        for channel in ("errors", "payments"):
            slack.notify(
                channel,
                "Billing: Stripe Tax is not active; checkout is running without automatic tax.",
                dedup_key="billing-stripe-tax-off",
            )
        fallback = {k: v for k, v in params.items() if k not in {"automatic_tax", "tax_id_collection"}}
        return gateway.create_checkout_session(fallback)


async def start_checkout(
    db: AsyncSession, user: User, slug: str, subject_id: str | None, quantity: int = 1
) -> dict[str, str]:
    plan = await plan_by_slug(db, slug)
    if plan is None or plan.mode == "free" or not plan.is_active:
        raise HTTPException(404, "This product is not available")
    if not plan.stripe_price_id:
        raise HTTPException(409, "This product is not set up for payment yet")
    if quantity != 1 and plan.slug != "extra_seat":
        raise HTTPException(422, "Quantity is only adjustable for team seats")
    subject = await _check_subject(db, user, plan, subject_id)
    try:
        customer = await customer_for(db, user)
    except gateway.BillingConfigError as exc:
        logger.error("Billing misconfigured", error=str(exc))
        raise HTTPException(503, "Payments are temporarily unavailable") from exc

    purchase = Purchase(
        user_id=user.id,
        plan_id=plan.id,
        plan_slug=plan.slug,
        mode=plan.mode,
        currency=plan.currency,
        subject_type=plan.target,
        subject_id=subject,
    )
    db.add(purchase)
    await db.flush()
    metadata = {
        "purchase_id": str(purchase.id),
        "user_id": str(user.id),
        "plan_slug": plan.slug,
        "subject_id": subject or "",
    }
    params: dict[str, Any] = {
        "mode": plan.mode,
        "customer": customer.stripe_customer_id,
        "client_reference_id": str(user.id),
        "line_items": [{"price": plan.stripe_price_id, "quantity": quantity}],
        "success_url": _web("/#/settings?tab=Billing&checkout=success"),
        "cancel_url": _web("/pricing?checkout=cancelled"),
        "metadata": metadata,
        "billing_address_collection": "required",
        "customer_update": {"address": "auto", "name": "auto"},
        "allow_promotion_codes": True,
        "consent_collection": {"terms_of_service": "required"},
        "custom_text": {"submit": {"message": WAIVER_TEXT}},
    }
    if settings.STRIPE_TAX_ENABLED:
        params["automatic_tax"] = {"enabled": True}
        params["tax_id_collection"] = {"enabled": True}
    if plan.mode == "payment":
        params["payment_intent_data"] = {"metadata": metadata}
        params["invoice_creation"] = {"enabled": True, "invoice_data": {"metadata": metadata}}
    else:
        sub_data: dict[str, Any] = {"metadata": metadata}
        if plan.trial_days and customer.trial_used_at is None:
            sub_data["trial_period_days"] = plan.trial_days
        params["subscription_data"] = sub_data
    try:
        session = _session_with_tax_fallback(params)
    except stripe.StripeError as exc:
        logger.error("Stripe checkout failed", error=type(exc).__name__)
        raise HTTPException(502, "We couldn't start checkout. Nothing was charged.") from exc
    purchase.stripe_checkout_session_id = session["id"]
    await db.flush()
    return {"url": session["url"], "purchase_id": str(purchase.id)}


async def portal_url(db: AsyncSession, user: User) -> str:
    customer = await db.get(BillingCustomer, user.id)
    if customer is None:
        raise HTTPException(404, "You have no billing account yet")
    return gateway.create_portal_session(
        customer=customer.stripe_customer_id, return_url=_web("/#/settings?tab=Billing")
    )


# ── fulfilment ───────────────────────────────────────────────────────────────


async def apply_one_off(db: AsyncSession, purchase: Purchase, plan: Plan) -> None:
    assert purchase.user_id is not None
    for key, value in (plan.entitlements or {}).items():
        quantity = 1 if value is True else int(value or 0)
        if quantity <= 0:
            continue
        await grants.grant(
            db,
            user_id=purchase.user_id,
            key=key,
            quantity=quantity,
            source="purchase",
            source_ref=str(purchase.id),
            subject_type=purchase.subject_type,
            subject_id=purchase.subject_id,
            expires_at=grants.expiry(plan.duration_days),
        )
    if plan.slug == "social_boost":
        purchase.fulfilment_status = "queued"
    else:
        purchase.fulfilment_status = "done"


async def sync_subscription_grants(db: AsyncSession, sub: Subscription, quantity: int = 1) -> None:
    ref = sub.stripe_subscription_id or str(sub.id)
    if sub.status not in KEEP_STATUSES:
        await grants.revoke_source(db, ref)
        return
    plan = await db.get(Plan, sub.plan_id)
    entitlements = (plan.entitlements if plan else {}) or {}
    for key, value in entitlements.items():
        q = 1 if value is True else int(value or 0)
        if key == "team_seats":
            q *= max(quantity, 1)
        await grants.grant(
            db, user_id=sub.user_id, key=key, quantity=q, source="subscription", source_ref=ref
        )
    await grants.revoke_source(db, ref, keep=entitlements.keys())


async def _user_for_customer(db: AsyncSession, customer_id: str | None, metadata: dict) -> uuid.UUID | None:
    if metadata.get("user_id"):
        try:
            return uuid.UUID(metadata["user_id"])
        except ValueError:
            pass
    if customer_id:
        row = await db.scalar(select(BillingCustomer).where(BillingCustomer.stripe_customer_id == customer_id))
        if row:
            return row.user_id
    return None


async def _upsert_subscription(
    db: AsyncSession, *, stripe_sub_id: str, user_id: uuid.UUID, plan: Plan, status_: str,
    period_end: datetime | None, cancel_at_period_end: bool, customer_id: str | None,
) -> Subscription:
    sub = await db.scalar(select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id))
    if sub is None:
        sub = Subscription(user_id=user_id, plan_id=plan.id, stripe_subscription_id=stripe_sub_id)
        db.add(sub)
    sub.plan_id = plan.id
    sub.status = status_
    sub.current_period_end = period_end or sub.current_period_end
    sub.cancel_at_period_end = cancel_at_period_end
    sub.stripe_customer_id = customer_id or sub.stripe_customer_id
    await db.flush()
    return sub


async def _qualify_referral(db: AsyncSession, user_id: uuid.UUID) -> None:
    referral = await db.scalar(
        select(Referral).where(Referral.referred_id == user_id, Referral.qualified_at.is_(None))
    )
    if referral is None:
        return
    referral.qualified_at = grants.now()
    referral.next_attempt_at = grants.now()
    await db.flush()
    await apply_referral_credits(db, referral)


def _backoff_minutes(attempts: int) -> int:
    return min(2 ** attempts, 24 * 60)


async def apply_referral_credits(db: AsyncSession, referral: Referral) -> bool:
    """Credit each side once; on a Stripe error schedule a retry with backoff.
    Returns True when both sides are credited."""
    amount = settings.BILLING_REFERRAL_CREDIT_CENTS
    sides = (("referrer_credited_at", referral.referrer_id), ("referred_credited_at", referral.referred_id))
    try:
        for field, uid in sides:
            if getattr(referral, field) is not None:
                continue
            customer = await db.get(BillingCustomer, uid)
            if customer is None:
                user = await db.get(User, uid)
                if user is None:
                    setattr(referral, field, grants.now())  # account gone: nothing to credit
                    continue
                customer = await customer_for(db, user)
            gateway.credit_customer_balance(
                customer=customer.stripe_customer_id, amount_cents=amount, description="Referral credit"
            )
            setattr(referral, field, grants.now())
            await db.flush()
    except (stripe.StripeError, gateway.BillingConfigError) as exc:
        referral.attempts += 1
        referral.last_error = type(exc).__name__
        referral.next_attempt_at = grants.now() + timedelta(minutes=_backoff_minutes(referral.attempts))
        logger.warning("Referral credit failed; will retry", attempts=referral.attempts, error=type(exc).__name__)
        if referral.attempts >= settings.BILLING_REFERRAL_MAX_ATTEMPTS:
            from app.services import slack

            slack.notify("errors", "Billing: a referral credit keeps failing; see staff console.",
                         dedup_key=f"referral-{referral.id}")
        await db.flush()
        return False
    referral.rewarded_at = grants.now()
    referral.next_attempt_at = None
    await db.flush()
    return True


async def retry_referral_credits(db: AsyncSession, limit: int = 50) -> dict[str, int]:
    """Celery Beat: retry referral credits whose backoff has passed."""
    rows = (
        await db.scalars(
            select(Referral)
            .where(
                Referral.qualified_at.is_not(None),
                Referral.rewarded_at.is_(None),
                Referral.attempts < settings.BILLING_REFERRAL_MAX_ATTEMPTS,
                Referral.next_attempt_at <= grants.now(),
            )
            .limit(limit)
        )
    ).all()
    done = 0
    for referral in rows:
        done += int(await apply_referral_credits(db, referral))
    return {"due": len(rows), "credited": done}


async def on_checkout_completed(db: AsyncSession, session: dict) -> None:
    metadata = session.get("metadata") or {}
    purchase = None
    if metadata.get("purchase_id"):
        try:
            purchase = await db.get(Purchase, uuid.UUID(metadata["purchase_id"]))
        except ValueError:
            purchase = None
    if purchase is None:
        purchase = await db.scalar(
            select(Purchase).where(Purchase.stripe_checkout_session_id == session.get("id"))
        )
    if purchase is None or purchase.user_id is None:
        logger.warning("Checkout session without a matching purchase", session_id=session.get("id"))
        return
    if purchase.status != "pending":
        return  # already fulfilled
    if session.get("payment_status") not in {"paid", "no_payment_required"}:
        return  # async payment methods settle later
    plan = await db.get(Plan, purchase.plan_id)
    if plan is None:
        return
    purchase.status = "paid"
    purchase.paid_at = grants.now()
    purchase.amount_total = session.get("amount_total")
    purchase.stripe_checkout_session_id = session.get("id") or purchase.stripe_checkout_session_id
    purchase.stripe_payment_intent_id = session.get("payment_intent")
    customer_id = session.get("customer")
    if customer_id and await db.get(BillingCustomer, purchase.user_id) is None:
        db.add(BillingCustomer(user_id=purchase.user_id, stripe_customer_id=customer_id))
    if plan.mode == "payment":
        await apply_one_off(db, purchase, plan)
    elif session.get("subscription"):
        purchase.stripe_subscription_id = session["subscription"]
        sub = await _upsert_subscription(
            db, stripe_sub_id=session["subscription"], user_id=purchase.user_id, plan=plan,
            status_="active", period_end=None, cancel_at_period_end=False, customer_id=customer_id,
        )
        await sync_subscription_grants(db, sub)
        purchase.fulfilment_status = "done"
        if plan.trial_days:
            customer = await db.get(BillingCustomer, purchase.user_id)
            if customer is not None and customer.trial_used_at is None:
                customer.trial_used_at = grants.now()
    await db.flush()
    if (purchase.amount_total or 0) > 0:
        await _qualify_referral(db, purchase.user_id)


async def on_checkout_expired(db: AsyncSession, session: dict) -> None:
    purchase = await db.scalar(
        select(Purchase).where(Purchase.stripe_checkout_session_id == session.get("id"))
    )
    if purchase is not None and purchase.status == "pending":
        purchase.status = "expired"
        await db.flush()


async def on_subscription_changed(db: AsyncSession, obj: dict, deleted: bool = False) -> None:
    items = ((obj.get("items") or {}).get("data")) or []
    price = (items[0].get("price") or {}) if items else {}
    quantity = int(items[0].get("quantity") or 1) if items else 1
    plan = None
    if price.get("id"):
        plan = await db.scalar(select(Plan).where(Plan.stripe_price_id == price["id"]))
    if plan is None and (price.get("lookup_key") or "").startswith("rap_"):
        plan = await plan_by_slug(db, price["lookup_key"][4:])
    if plan is None and (obj.get("metadata") or {}).get("plan_slug"):
        plan = await plan_by_slug(db, obj["metadata"]["plan_slug"])
    existing = await db.scalar(select(Subscription).where(Subscription.stripe_subscription_id == obj.get("id")))
    if plan is None and existing is not None:
        plan = await db.get(Plan, existing.plan_id)
    user_id = existing.user_id if existing else await _user_for_customer(
        db, obj.get("customer"), obj.get("metadata") or {}
    )
    if plan is None or user_id is None:
        logger.warning("Subscription event for unknown plan or user", subscription=obj.get("id"))
        return
    period_end = _ts(obj.get("current_period_end") or (items[0].get("current_period_end") if items else None))
    sub = await _upsert_subscription(
        db, stripe_sub_id=obj["id"], user_id=user_id, plan=plan,
        status_="canceled" if deleted else str(obj.get("status") or "active"),
        period_end=period_end, cancel_at_period_end=bool(obj.get("cancel_at_period_end")),
        customer_id=obj.get("customer"),
    )
    await sync_subscription_grants(db, sub, quantity)


async def on_invoice_paid(db: AsyncSession, inv: dict) -> None:
    if await db.scalar(select(Invoice.id).where(Invoice.stripe_invoice_id == inv["id"])):
        return
    lines = ((inv.get("lines") or {}).get("data")) or []
    period = (lines[0].get("period") or {}) if lines else {}
    sub_id = inv.get("subscription") or (
        ((inv.get("parent") or {}).get("subscription_details") or {}).get("subscription")
    )
    user_id = await _user_for_customer(db, inv.get("customer"), inv.get("metadata") or {})
    db.add(
        Invoice(
            user_id=user_id,
            stripe_invoice_id=inv["id"],
            stripe_subscription_id=sub_id,
            amount_paid=int(inv.get("amount_paid") or 0),
            currency=str(inv.get("currency") or "eur"),
            status="paid",
            hosted_invoice_url=inv.get("hosted_invoice_url"),
            invoice_pdf=inv.get("invoice_pdf"),
            period_start=_ts(period.get("start")),
            period_end=_ts(period.get("end")),
        )
    )
    if sub_id:
        sub = await db.scalar(select(Subscription).where(Subscription.stripe_subscription_id == sub_id))
        if sub is not None:
            if period.get("end"):
                sub.current_period_end = _ts(period["end"])
            if sub.status in {"past_due", "incomplete"}:
                sub.status = "active"
            await sync_subscription_grants(db, sub)
    await db.flush()


async def on_invoice_failed(db: AsyncSession, inv: dict) -> None:
    """Dunning: tell the member (Brevo, through the email outbox) once per invoice attempt."""
    from app.services.email.outbox import enqueue_email, render_email

    user_id = await _user_for_customer(db, inv.get("customer"), inv.get("metadata") or {})
    if user_id is None:
        return
    attempt = inv.get("attempt_count") or 1
    await enqueue_email(
        db,
        user_id,
        f"billing-dunning:{inv['id']}:{attempt}",
        "billing_payment_failed",
        "Your Remote AI Platform payment didn't go through",
        render_email(
            "Your payment didn't go through",
            "We couldn't take the payment for your subscription. Stripe will try again over the next "
            "few days. Please update your payment method in Settings > Billing to keep your plan.",
            "/#/settings?tab=Billing",
        ),
    )


async def on_charge_refunded(db: AsyncSession, charge: dict) -> None:
    intent = charge.get("payment_intent")
    if not intent:
        return
    purchase = await db.scalar(select(Purchase).where(Purchase.stripe_payment_intent_id == intent))
    if purchase is None:
        return
    refunded = int(charge.get("amount_refunded") or 0)
    purchase.amount_refunded = refunded
    total = purchase.amount_total or int(charge.get("amount") or 0)
    if charge.get("refunded") or (total and refunded >= total):
        purchase.status = "refunded"
        purchase.refunded_at = grants.now()
        await grants.revoke_source(db, str(purchase.id))
    elif refunded > 0:
        purchase.status = "partially_refunded"
    await db.flush()


async def handle_event(db: AsyncSession, event: Any) -> None:
    kind = event["type"]
    obj = event["data"]["object"]
    obj = obj.to_dict() if hasattr(obj, "to_dict") else dict(obj)
    if kind == "checkout.session.completed":
        await on_checkout_completed(db, obj)
    elif kind == "checkout.session.expired":
        await on_checkout_expired(db, obj)
    elif kind == "invoice.paid":
        await on_invoice_paid(db, obj)
    elif kind == "invoice.payment_failed":
        await on_invoice_failed(db, obj)
    elif kind in {"customer.subscription.created", "customer.subscription.updated"}:
        await on_subscription_changed(db, obj)
    elif kind == "customer.subscription.deleted":
        await on_subscription_changed(db, obj, deleted=True)
    elif kind == "charge.refunded":
        await on_charge_refunded(db, obj)
    billing_alert(kind, obj)


def _money(cents: Any, currency: Any) -> str | None:
    if cents is None:
        return None
    return f"{int(cents) / 100:.2f} {str(currency or 'eur').upper()}"


# Stripe event -> (emoji + title, money field). Posted to Slack #payments (else #signups).
_BILLING_ALERTS: dict[str, tuple[str, str]] = {
    "checkout.session.completed": (":moneybag: New purchase", "amount_total"),
    "invoice.paid": (":receipt: Invoice paid", "amount_paid"),
    "invoice.payment_failed": (":x: Payment failed", "amount_due"),
    "customer.subscription.created": (":tada: New subscription", ""),
    "customer.subscription.deleted": (":wave: Subscription cancelled", ""),
    "charge.refunded": (":leftwards_arrow_with_hook: Refund issued", "amount_refunded"),
}


def billing_alert(kind: str, obj: dict) -> None:
    """Owner notification for money events. Ids and amounts only, never names or emails."""
    spec = _BILLING_ALERTS.get(kind)
    if spec is None:
        return
    if kind == "checkout.session.completed" and obj.get("payment_status") not in {
        "paid",
        "no_payment_required",
    }:
        return
    if kind == "invoice.paid" and not int(obj.get("amount_paid") or 0):
        return
    title, money_key = spec
    from app.services import slack

    metadata = obj.get("metadata") or {}
    fields: dict[str, Any] = {
        "amount": _money(obj.get(money_key), obj.get("currency")) if money_key else None,
        "plan": metadata.get("plan_slug"),
        "stripe id": obj.get("id"),
    }
    if kind == "invoice.payment_failed":
        fields["attempt"] = obj.get("attempt_count")
    slack.notify("payments", title, dedup_key=f"billing:{kind}:{obj.get('id')}", fields=fields)


# ── account deletion (auth/retention.py) ────────────────────────────────────


async def cancel_for_deletion(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Cancel every live subscription at period end before the account is erased.
    Raises 503 when Stripe can't be reached, so nobody is billed for a deleted account."""
    subs = (
        await db.scalars(
            select(Subscription).where(
                Subscription.user_id == user_id, Subscription.status.in_(tuple(KEEP_STATUSES))
            )
        )
    ).all()
    count = 0
    for sub in subs:
        if sub.stripe_subscription_id and not sub.cancel_at_period_end:
            try:
                gateway.cancel_at_period_end(sub.stripe_subscription_id)
            except (stripe.StripeError, gateway.BillingConfigError) as exc:
                raise HTTPException(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    "We couldn't cancel your subscription with our payment provider. Please try again.",
                ) from exc
            sub.cancel_at_period_end = True
            count += 1
    await db.flush()
    return count


# ── referrals ───────────────────────────────────────────────────────────────


async def referral_code(db: AsyncSession, user_id: uuid.UUID) -> str:
    row = await db.get(ReferralCode, user_id)
    if row is None:
        row = ReferralCode(user_id=user_id, code=secrets.token_hex(5).upper())
        db.add(row)
        await db.flush()
    return row.code


async def claim_referral(db: AsyncSession, user: User, code: str) -> None:
    owner = await db.scalar(select(ReferralCode).where(ReferralCode.code == code.strip().upper()))
    if owner is None or owner.user_id == user.id:
        raise HTTPException(404, "Referral code not found")
    if await db.scalar(select(Referral.id).where(Referral.referred_id == user.id)):
        raise HTTPException(409, "You have already used a referral code")
    if await db.scalar(select(Purchase.id).where(Purchase.user_id == user.id, Purchase.status != "pending")):
        raise HTTPException(409, "Referral codes are for members who haven't bought anything yet")
    db.add(Referral(referrer_id=owner.user_id, referred_id=user.id))
    await db.flush()
