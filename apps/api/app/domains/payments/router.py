"""
Payments & Financial Ledger FastAPI router.

Provides wallet balances, escrow holdings, transaction history,
and escrow release/refund financial workflows.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.marketplace.models import ProjectTask
from app.domains.projects.models import PaymentTransaction, Project, ProjectMember
from app.domains.payments.schemas import (
    DirectEscrowCreate,
    PaymentPartySummary,
    PaymentTransactionResponse,
    WalletBalanceResponse,
)
from app.services.notifications import notify_user
from app.services.payments import SandboxPaymentProvider

router = APIRouter(prefix="/payments", tags=["Payments & Financial Ledger"])


def _party_summary(user: User) -> PaymentPartySummary:
    return PaymentPartySummary(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
    )


async def _enrich_transaction(p: PaymentTransaction, db: AsyncSession) -> PaymentTransactionResponse:
    payer = await db.get(User, p.payer_id)
    payee = await db.get(User, p.payee_id)

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
    )


@router.get("/wallet", response_model=WalletBalanceResponse, summary="Get user wallet balance overview")
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


@router.get("/transactions", response_model=list[PaymentTransactionResponse], summary="List transaction history")
async def list_transactions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
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
    )
    txs = result.scalars().all()
    return [await _enrich_transaction(t, db) for t in txs]


@router.post("/escrow", status_code=status.HTTP_201_CREATED, response_model=PaymentTransactionResponse, summary="Create escrow payment")
async def create_escrow_payment(
    data: DirectEscrowCreate,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    idempotency_key: Optional[str] = Query(None, alias="idempotency_key"),
    db: AsyncSession = Depends(get_db),
) -> PaymentTransactionResponse:
    """Authorize and hold funds in escrow for a project or task with idempotency support."""
    # Check idempotency
    if idempotency_key:
        existing = await db.scalar(
            select(PaymentTransaction).where(
                PaymentTransaction.payer_id == current_user.id,
                PaymentTransaction.project_id == data.project_id,
                PaymentTransaction.provider_reference.like(f"%{idempotency_key}%"),
            )
        )
        if existing:
            return await _enrich_transaction(existing, db)

    project = await db.get(Project, data.project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if current_user.role != UserRole.ADMIN:
        company = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == current_user.id))
        if not company or company.id != project.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project access required")

    payee = await db.get(User, data.payee_id)
    if not payee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payee user not found")

    if data.task_id:
        task = await db.get(ProjectTask, data.task_id)
        if not task or task.project_id != project.id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Task must belong to project")

    provider = SandboxPaymentProvider()
    authorization = await provider.authorize(data.amount, data.currency.upper())
    held = await provider.hold(authorization.reference, data.amount, data.currency.upper())

    provider_ref = f"{held.reference}_{idempotency_key}" if idempotency_key else held.reference

    payment = PaymentTransaction(
        project_id=data.project_id,
        task_id=data.task_id,
        payer_id=current_user.id,
        payee_id=data.payee_id,
        amount=data.amount,
        currency=data.currency.upper(),
        status=held.status,
        provider="SANDBOX",
        provider_reference=provider_ref,
    )
    db.add(payment)
    await db.flush()

    await notify_user(
        db,
        data.payee_id,
        "Escrow Funded",
        f"An escrow payment of {data.amount:.2f} {data.currency.upper()} has been funded for {project.title}.",
        "escrow_funded",
    )

    return await _enrich_transaction(payment, db)


@router.post("/{payment_id}/release", response_model=PaymentTransactionResponse, summary="Release escrow payment")
async def release_escrow(
    payment_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> PaymentTransactionResponse:
    """Release escrowed payment to the worker."""
    payment = await db.get(PaymentTransaction, payment_id)
    if not payment or payment.payer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Escrow transaction not found")

    if payment.status != "ESCROWED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment is not currently in escrow")

    result = await SandboxPaymentProvider().release(payment.provider_reference)
    payment.status = result.status
    payment.released_at = datetime.now(timezone.utc)
    await db.flush()

    await notify_user(
        db,
        payment.payee_id,
        "Payment Released!",
        f"Payment of {payment.amount:.2f} {payment.currency} has been released to your wallet.",
        "payment_released",
    )

    return await _enrich_transaction(payment, db)


@router.post("/{payment_id}/refund", response_model=PaymentTransactionResponse, summary="Refund escrow payment")
async def refund_escrow(
    payment_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> PaymentTransactionResponse:
    """Refund escrowed payment back to the client."""
    payment = await db.get(PaymentTransaction, payment_id)
    if not payment or payment.payer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Escrow transaction not found")

    if payment.status != "ESCROWED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment is not currently in escrow")

    result = await SandboxPaymentProvider().refund(payment.provider_reference)
    payment.status = result.status
    await db.flush()

    return await _enrich_transaction(payment, db)
