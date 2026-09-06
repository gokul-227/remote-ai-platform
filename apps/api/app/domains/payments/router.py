"""
Payments & Financial Ledger FastAPI router.

Provides wallet balances, escrow holdings, transaction history,
and escrow release/refund financial workflows.
"""

import uuid
from datetime import UTC, datetime

import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.marketplace.models import ProjectTask
from app.domains.payments.models import StripeWebhookEvent
from app.domains.payments.schemas import (
    DirectEscrowCreate,
    PaymentPartySummary,
    PaymentTransactionResponse,
    WalletBalanceResponse,
)
from app.domains.projects.models import PaymentTransaction, Project
from app.services.notifications import notify_user
from app.services.payments import get_payment_provider

logger = get_logger("payments.router")

router = APIRouter(prefix="/payments", tags=["Payments & Financial Ledger"])


def _party_summary(user: User) -> PaymentPartySummary:
    return PaymentPartySummary(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
    )


def _build_transaction_response(
    p: PaymentTransaction,
    payer: User | None,
    payee: User | None,
    client_secret: str | None = None,
) -> PaymentTransactionResponse:
    return PaymentTransactionResponse(
        id=p.id,
        project_id=p.project_id,
        task_id=p.task_id,
        payer_id=p.payer_id,
        payee_id=p.payee_id,
        payer=_party_summary(payer) if payer else None,
        payee=_party_summary(payee) if payee else None,
        amount=p.amount,
        currency=p.currency,
        status=p.status,
        provider=p.provider,
        provider_reference=p.provider_reference,
        created_at=p.created_at,
        released_at=p.released_at,
        client_secret=client_secret,
    )


async def _enrich_transaction(
    p: PaymentTransaction, db: AsyncSession, client_secret: str | None = None
) -> PaymentTransactionResponse:
    payer = await db.get(User, p.payer_id)
    payee = await db.get(User, p.payee_id)
    return _build_transaction_response(p, payer, payee, client_secret)


@router.get(
    "/wallet", response_model=WalletBalanceResponse, summary="Get user wallet balance overview"
)
async def get_wallet_balance(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WalletBalanceResponse:
    """Calculate and return escrow balances, total earned, and total spent for current user."""
    # Transactions where user is payer (Client)
    payer_result = await db.execute(
        select(PaymentTransaction).where(PaymentTransaction.payer_id == current_user.id)
    )
    payer_txs = payer_result.scalars().all()

    # Transactions where user is payee (Worker)
    payee_result = await db.execute(
        select(PaymentTransaction).where(PaymentTransaction.payee_id == current_user.id)
    )
    payee_txs = payee_result.scalars().all()

    escrow_held = sum(p.amount for p in payer_txs if p.status == "ESCROWED") + sum(
        p.amount for p in payee_txs if p.status == "ESCROWED"
    )
    total_spent = sum(p.amount for p in payer_txs if p.status in {"RELEASED", "ESCROWED"})
    total_earned = sum(p.amount for p in payee_txs if p.status == "RELEASED")
    total_released = sum(p.amount for p in payer_txs if p.status == "RELEASED")

    return WalletBalanceResponse(
        user_id=current_user.id,
        escrow_held=round(escrow_held, 2),
        total_earned=round(total_earned, 2),
        total_spent=round(total_spent, 2),
        total_released=round(total_released, 2),
        currency="USD",
    )


@router.get(
    "/transactions",
    response_model=list[PaymentTransactionResponse],
    summary="List transaction history",
)
async def list_transactions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[PaymentTransactionResponse]:
    """List all financial transactions involving the current user."""
    result = await db.execute(
        select(PaymentTransaction)
        .where(
            or_(
                PaymentTransaction.payer_id == current_user.id,
                PaymentTransaction.payee_id == current_user.id,
            )
        )
        .order_by(PaymentTransaction.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    txs = list(result.scalars().all())
    if not txs:
        return []

    # Batch-fetch payer/payee users in one query instead of two gets per
    # transaction (previously N+1 across the whole list).
    user_ids = {t.payer_id for t in txs} | {t.payee_id for t in txs}
    users_res = await db.execute(select(User).where(User.id.in_(user_ids)))
    users_by_id = {u.id: u for u in users_res.scalars().all()}

    return [
        _build_transaction_response(t, users_by_id.get(t.payer_id), users_by_id.get(t.payee_id))
        for t in txs
    ]


@router.post(
    "/escrow",
    status_code=status.HTTP_201_CREATED,
    response_model=PaymentTransactionResponse,
    summary="Create escrow payment",
)
async def create_escrow_payment(
    data: DirectEscrowCreate,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    idempotency_key: str | None = Query(None, alias="idempotency_key"),
    db: AsyncSession = Depends(get_db),
) -> PaymentTransactionResponse:
    """Authorize and hold funds in escrow for a project or task with idempotency support."""
    # Check idempotency
    if idempotency_key:
        existing = await db.scalar(
            select(PaymentTransaction).where(
                PaymentTransaction.payer_id == current_user.id,
                PaymentTransaction.project_id == data.project_id,
                PaymentTransaction.idempotency_key == idempotency_key,
            )
        )
        if existing:
            return await _enrich_transaction(existing, db)

    project = await db.get(Project, data.project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if current_user.role != UserRole.ADMIN:
        company = await db.scalar(
            select(CompanyProfile).where(CompanyProfile.user_id == current_user.id)
        )
        if not company or company.id != project.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Project access required"
            )

    payee = await db.get(User, data.payee_id)
    if not payee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payee user not found")

    if data.task_id:
        task = await db.get(ProjectTask, data.task_id)
        if not task or task.project_id != project.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Task must belong to project",
            )

    provider = get_payment_provider()
    authorization = await provider.authorize(data.amount, data.currency.upper())
    held = await provider.hold(authorization.reference, data.amount, data.currency.upper())

    payment = PaymentTransaction(
        project_id=data.project_id,
        task_id=data.task_id,
        payer_id=current_user.id,
        payee_id=data.payee_id,
        amount=data.amount,
        currency=data.currency.upper(),
        status=held.status,
        provider=settings.PAYMENT_PROVIDER.upper(),
        provider_reference=held.reference,
        idempotency_key=idempotency_key,
    )
    db.add(payment)
    await db.flush()

    # Only meaningful once real, actual funds have moved -- with Stripe,
    # that's after the frontend confirms this PaymentIntent client-side and
    # the escrow-funded webhook fires, not at creation time.
    if held.status == "ESCROWED":
        await notify_user(
            db,
            data.payee_id,
            "Escrow Funded",
            f"An escrow payment of {data.amount:.2f} {data.currency.upper()} has been funded for {project.title}.",
            "escrow_funded",
        )

    return await _enrich_transaction(payment, db, client_secret=authorization.client_secret)


@router.post(
    "/{payment_id}/release",
    response_model=PaymentTransactionResponse,
    summary="Release escrow payment",
)
async def release_escrow(
    payment_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> PaymentTransactionResponse:
    """Release escrowed payment to the worker."""
    payment = await db.get(PaymentTransaction, payment_id)
    if not payment or payment.payer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Escrow transaction not found"
        )

    if payment.status != "ESCROWED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Payment is not currently in escrow"
        )

    result = await get_payment_provider().release(payment.provider_reference)
    payment.status = result.status
    payment.released_at = datetime.now(UTC)
    await db.flush()

    await notify_user(
        db,
        payment.payee_id,
        "Payment Released!",
        f"Payment of {payment.amount:.2f} {payment.currency} has been released to your wallet.",
        "payment_released",
    )

    return await _enrich_transaction(payment, db)


@router.post(
    "/{payment_id}/refund",
    response_model=PaymentTransactionResponse,
    summary="Refund escrow payment",
)
async def refund_escrow(
    payment_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> PaymentTransactionResponse:
    """Refund escrowed payment back to the client."""
    payment = await db.get(PaymentTransaction, payment_id)
    if not payment or payment.payer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Escrow transaction not found"
        )

    if payment.status != "ESCROWED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Payment is not currently in escrow"
        )

    result = await get_payment_provider().refund(payment.provider_reference)
    payment.status = result.status
    await db.flush()

    return await _enrich_transaction(payment, db)


# Stripe PaymentIntent.status -> this app's PaymentTransaction.status.
_WEBHOOK_STATUS_MAP = {
    "payment_intent.amount_capturable_updated": "ESCROWED",  # customer confirmed -> funds held
    "payment_intent.succeeded": "RELEASED",  # captured -> funds moved
    "payment_intent.canceled": "REFUNDED",
    "payment_intent.payment_failed": "FAILED",
}

# Once a payment reaches one of these, it's done -- funds have either moved
# to the payee (RELEASED) or moved back / never captured (REFUNDED/FAILED).
# An out-of-order webhook replay (still validly signed, e.g. a captured and
# resent request within Stripe's signature timestamp tolerance, or events
# delivered out of order) must never be allowed to move a terminal payment
# backward -- e.g. an old payment_intent.canceled arriving after the escrow
# was already released must not silently revert it to REFUNDED.
_TERMINAL_STATUSES = {"RELEASED", "REFUNDED", "FAILED"}


@router.post("/webhooks/stripe", include_in_schema=False)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Stripe webhook receiver -- the only path that ever marks an escrow as
    actually funded, since that requires the customer to have confirmed the
    PaymentIntent client-side (this app never sees card details).

    Never active unless PAYMENT_PROVIDER=stripe and STRIPE_WEBHOOK_SECRET is
    configured; every event's signature is verified before any DB write.
    """
    if settings.PAYMENT_PROVIDER != "stripe" or not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature") from exc

    event_id = event.get("id")
    if not event_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing event id")

    # Dedup ledger: event_id is the table's primary key, so a second
    # delivery of the same event -- Stripe's own retries, or a
    # captured-and-replayed request -- raises IntegrityError here and is
    # treated as an already-processed no-op, even if it arrives concurrently
    # with the first (the unique constraint is enforced by Postgres, not by
    # this process's in-memory state).
    try:
        async with db.begin_nested():
            db.add(StripeWebhookEvent(event_id=event_id, event_type=event["type"]))
            await db.flush()
    except IntegrityError:
        logger.info("Duplicate Stripe webhook event ignored", event_id=event_id, event_type=event["type"])
        return {"received": True, "duplicate": True}

    new_status = _WEBHOOK_STATUS_MAP.get(event["type"])
    if not new_status:
        await db.commit()
        return {"received": True}  # event type we don't act on

    intent_id = event["data"]["object"]["id"]
    payment = await db.scalar(
        select(PaymentTransaction).where(PaymentTransaction.provider_reference == intent_id)
    )
    if not payment:
        await db.commit()
        return {"received": True}  # not one of ours (or already deleted) -- not an error

    if payment.status in _TERMINAL_STATUSES and payment.status != new_status:
        # Already reached a terminal state; an older event replayed out of
        # order must never move it backward.
        logger.warning(
            "Ignoring Stripe webhook that would move a terminal payment backward",
            event_id=event_id,
            event_type=event["type"],
            payment_id=str(payment.id),
            current_status=payment.status,
            attempted_status=new_status,
        )
        await db.commit()
        return {"received": True}

    # Idempotent by construction: re-delivering the same event just sets the
    # same status again. Only notify on an actual transition so a webhook
    # retry can't send duplicate notifications.
    if payment.status != new_status:
        payment.status = new_status
        if new_status == "RELEASED":
            payment.released_at = datetime.now(UTC)
        await db.flush()
        if new_status == "ESCROWED":
            await notify_user(
                db,
                payment.payee_id,
                "Escrow Funded",
                f"An escrow payment of {payment.amount:.2f} {payment.currency} has been funded.",
                "escrow_funded",
            )

    await db.commit()
    return {"received": True}
