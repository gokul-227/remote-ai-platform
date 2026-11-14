"""Project demo registry backed by immutable, reviewable deliverables.

No server fetch, embedding or proxying: viewers receive a validated external
URL, and the browser must open it with noopener/noreferrer.
"""

import uuid
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import field_validator
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.contracts.lifecycle import party_of
from app.domains.contracts.models import Contract
from app.domains.deliverables.models import Deliverable
from app.domains.deliverables.router import review_deliverable, submit_demo, withdraw_deliverable
from app.domains.deliverables.schemas import (
    DeliverableResponse,
    DeliverableReview,
    DemoDeliverableCreate,
)
from app.domains.deliverables.validation import validate_demo_url
from app.domains.projects.models import Project

router = APIRouter(prefix="/projects", tags=["Project demos"])


def safe_demo_url(value: str) -> str:
    url = validate_demo_url(value)
    parts = urlsplit(url)
    host = (parts.hostname or "").lower().rstrip(".")
    if (parts.scheme != "https" or not host or "." not in host or ":" in host
            or all(c in "0123456789." for c in host)
            or host.rsplit(".", 1)[-1] in {"localhost", "local", "internal", "test", "invalid", "example"}
            or any(c.isspace() or ord(c) < 32 for c in url) or "\\" in url
            or "%" in host):
        raise ValueError("Use a public HTTPS demo URL")
    # Accessing port validates malformed/out-of-range ports without fetching the URL.
    _ = parts.port
    return url


class DemoRegistration(DemoDeliverableCreate):
    contract_id: uuid.UUID

    _safe_url = field_validator("demo_url")(lambda cls, value: safe_demo_url(value))


async def _project_contract(db: AsyncSession, project_id: uuid.UUID, contract_id: uuid.UUID, user: User) -> Contract:
    project = await db.get(Project, project_id)
    contract = await db.get(Contract, contract_id)
    if (project is None or project.is_deleted or contract is None or contract.is_deleted
            or contract.project_id != project_id or party_of(contract, user.id) is None):
        raise HTTPException(404, "Project engagement not found")
    return contract


async def _demo(db: AsyncSession, project_id: uuid.UUID, demo_id: uuid.UUID, user: User) -> Deliverable:
    demo = await db.get(Deliverable, demo_id)
    if demo is None or demo.kind != "DEMO":
        raise HTTPException(404, "Demo not found")
    await _project_contract(db, project_id, demo.contract_id, user)
    return demo


@router.get("/{project_id}/demos", response_model=list[DeliverableResponse])
async def list_demos(
    project_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # A workspace member does not automatically gain another party's contract data.
    project = await db.get(Project, project_id)
    eligible = select(Contract.id).where(
        Contract.project_id == project_id, Contract.is_deleted.is_(False),
        or_(Contract.client_id == current_user.id, Contract.worker_id == current_user.id),
    )
    if project is None or project.is_deleted or await db.scalar(eligible) is None:
        raise HTTPException(404, "Project engagement not found")
    return (await db.scalars(select(Deliverable).where(
        Deliverable.contract_id.in_(eligible), Deliverable.kind == "DEMO",
    ).order_by(Deliverable.created_at.desc(), Deliverable.id).offset(offset).limit(limit))).all()


@router.post("/{project_id}/demos", response_model=DeliverableResponse, status_code=status.HTTP_201_CREATED)
async def register_demo(
    project_id: uuid.UUID,
    payload: DemoRegistration,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _project_contract(db, project_id, payload.contract_id, current_user)
    return await submit_demo(payload.contract_id, DemoDeliverableCreate.model_validate(
        payload.model_dump(exclude={"contract_id"})
    ), current_user, db)


@router.get("/{project_id}/demos/{demo_id}/view")
async def view_demo(
    project_id: uuid.UUID,
    demo_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    demo = await _demo(db, project_id, demo_id, current_user)
    if demo.status == "WITHDRAWN":
        raise HTTPException(409, "This demo was withdrawn")
    try:
        url = safe_demo_url(demo.demo_url or "")
    except ValueError as exc:
        raise HTTPException(422, "This demo requires a safe HTTPS URL") from exc
    return {"url": url, "mode": "EXTERNAL", "rel": "noopener noreferrer"}


@router.post("/{project_id}/demos/{demo_id}/review", response_model=DeliverableResponse)
async def review_demo(
    project_id: uuid.UUID,
    demo_id: uuid.UUID,
    payload: DeliverableReview,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    demo = await _demo(db, project_id, demo_id, current_user)
    return await review_deliverable(demo.contract_id, demo.id, payload, current_user, db)


@router.post("/{project_id}/demos/{demo_id}/withdraw", response_model=DeliverableResponse)
async def withdraw_demo(
    project_id: uuid.UUID,
    demo_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    demo = await _demo(db, project_id, demo_id, current_user)
    return await withdraw_deliverable(demo.contract_id, demo.id, current_user, db)
