"""
Contracts domain FastAPI router.

Handles contract creation, negotiation/offering, digital signing,
milestone management, and contract lifecycle status updates.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.contracts.models import Contract, ContractMilestone
from app.domains.projects.models import Project
from app.domains.contracts.schemas import (
    ContractCreate,
    ContractMilestoneCreate,
    ContractMilestoneResponse,
    ContractResponse,
    ContractUpdate,
    UserPartySummary,
)
from app.services.notifications import notify_user

router = APIRouter(prefix="/contracts", tags=["Contracts"])


def _user_summary(user: User) -> UserPartySummary:
    return UserPartySummary(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
    )


async def _enrich_contract(contract: Contract, db: AsyncSession) -> ContractResponse:
    await db.refresh(contract)
    client = await db.get(User, contract.client_id)
    worker = await db.get(User, contract.worker_id)
    milestones_res = await db.execute(
        select(ContractMilestone)
        .where(ContractMilestone.contract_id == contract.id)
        .order_by(ContractMilestone.created_at.asc())
    )
    milestones = milestones_res.scalars().all()

    return ContractResponse(
        id=contract.id,
        project_id=contract.project_id,
        client_id=contract.client_id,
        worker_id=contract.worker_id,
        client=_user_summary(client) if client else None,
        worker=_user_summary(worker) if worker else None,
        title=contract.title,
        scope_description=contract.scope_description,
        rate_type=contract.rate_type,
        rate_amount=contract.rate_amount,
        currency=contract.currency,
        status=contract.status,
        terms=contract.terms,
        client_signed_at=contract.client_signed_at,
        worker_signed_at=contract.worker_signed_at,
        start_date=contract.start_date,
        end_date=contract.end_date,
        created_at=contract.created_at,
        updated_at=contract.updated_at,
        milestones=[ContractMilestoneResponse.model_validate(m) for m in milestones],
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ContractResponse, summary="Create contract")
async def create_contract(
    data: ContractCreate,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> ContractResponse:
    """Create a new work contract (Client or Admin)."""
    worker = await db.get(User, data.worker_id)
    if not worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker user not found")

    if data.project_id:
        project = await db.get(Project, data.project_id)
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if current_user.role != UserRole.ADMIN:
            company = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == current_user.id))
            if not company or company.id != project.company_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project access required")

    contract = Contract(
        project_id=data.project_id,
        client_id=current_user.id,
        worker_id=data.worker_id,
        title=data.title,
        scope_description=data.scope_description,
        rate_type=data.rate_type,
        rate_amount=data.rate_amount,
        currency=data.currency,
        status="OFFERED",
        terms=data.terms,
        start_date=data.start_date,
        end_date=data.end_date,
    )
    db.add(contract)
    await db.flush()

    # Add initial milestones
    for m in data.milestones:
        db.add(
            ContractMilestone(
                contract_id=contract.id,
                title=m.title,
                amount=m.amount,
                due_date=m.due_date,
            )
        )
    await db.flush()

    await notify_user(
        db,
        data.worker_id,
        "New Contract Offer",
        f"You have received a new contract offer: {contract.title}",
        "contract_offer",
    )

    return await _enrich_contract(contract, db)


@router.get("/me", response_model=list[ContractResponse], summary="List my contracts")
async def list_my_contracts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ContractResponse]:
    """List contracts where current user is Client or Worker."""
    result = await db.execute(
        select(Contract)
        .where(or_(Contract.client_id == current_user.id, Contract.worker_id == current_user.id))
        .order_by(Contract.created_at.desc())
    )
    contracts = result.scalars().all()
    enriched = []
    for c in contracts:
        enriched.append(await _enrich_contract(c, db))
    return enriched


@router.get("/{contract_id}", response_model=ContractResponse, summary="Get contract details")
async def get_contract(
    contract_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContractResponse:
    contract = await db.get(Contract, contract_id)
    if not contract or current_user.id not in (contract.client_id, contract.worker_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
    return await _enrich_contract(contract, db)


@router.patch("/{contract_id}", response_model=ContractResponse, summary="Update contract")
async def update_contract(
    contract_id: uuid.UUID,
    data: ContractUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContractResponse:
    contract = await db.get(Contract, contract_id)
    if not contract or current_user.id != contract.client_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found or access denied")
    if contract.status in {"ACTIVE", "COMPLETED", "TERMINATED"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Active/signed contract cannot be updated")

    if data.title is not None:
        contract.title = data.title
    if data.scope_description is not None:
        contract.scope_description = data.scope_description
    if data.rate_type is not None:
        contract.rate_type = data.rate_type
    if data.rate_amount is not None:
        contract.rate_amount = data.rate_amount
    if data.terms is not None:
        contract.terms = data.terms
    if data.start_date is not None:
        contract.start_date = data.start_date
    if data.end_date is not None:
        contract.end_date = data.end_date

    await db.flush()
    return await _enrich_contract(contract, db)


@router.post("/{contract_id}/sign", response_model=ContractResponse, summary="Digital sign contract")
async def sign_contract(
    contract_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContractResponse:
    """Digitally sign contract. Transitions status to ACTIVE when both parties sign."""
    contract = await db.get(Contract, contract_id)
    if not contract or current_user.id not in (contract.client_id, contract.worker_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
    if contract.status in {"COMPLETED", "TERMINATED"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Contract is already completed or terminated")

    now = datetime.now(timezone.utc)
    if current_user.id == contract.client_id:
        contract.client_signed_at = now
    if current_user.id == contract.worker_id:
        contract.worker_signed_at = now

    # If both signed, activate contract
    if contract.client_signed_at and contract.worker_signed_at:
        contract.status = "ACTIVE"
        recipient = contract.worker_id if current_user.id == contract.client_id else contract.client_id
        await notify_user(
            db,
            recipient,
            "Contract Fully Signed!",
            f"Contract '{contract.title}' is now ACTIVE.",
            "contract_active",
        )
    else:
        contract.status = "SIGNED"

    await db.flush()
    return await _enrich_contract(contract, db)


@router.post("/{contract_id}/terminate", response_model=ContractResponse, summary="Terminate contract")
async def terminate_contract(
    contract_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContractResponse:
    contract = await db.get(Contract, contract_id)
    if not contract or current_user.id not in (contract.client_id, contract.worker_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")

    contract.status = "TERMINATED"
    await db.flush()

    recipient = contract.worker_id if current_user.id == contract.client_id else contract.client_id
    await notify_user(
        db,
        recipient,
        "Contract Terminated",
        f"Contract '{contract.title}' was terminated.",
        "contract_terminated",
    )

    return await _enrich_contract(contract, db)


@router.post(
    "/{contract_id}/milestones",
    status_code=status.HTTP_201_CREATED,
    response_model=ContractMilestoneResponse,
    summary="Add milestone",
)
async def add_milestone(
    contract_id: uuid.UUID,
    data: ContractMilestoneCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContractMilestoneResponse:
    contract = await db.get(Contract, contract_id)
    if not contract or current_user.id not in (contract.client_id, contract.worker_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")

    milestone = ContractMilestone(
        contract_id=contract_id,
        title=data.title,
        amount=data.amount,
        due_date=data.due_date,
    )
    db.add(milestone)
    await db.flush()
    await db.refresh(milestone)
    return ContractMilestoneResponse.model_validate(milestone)
