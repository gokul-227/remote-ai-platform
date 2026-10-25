"""
Deliverables domain FastAPI router.

Code (immutable commit reference), document (private file) and demo (link)
deliverables, submitted by the contract's professional against a milestone of
an ACTIVE contract and reviewed by the client. Only the two contract parties
can see them; everyone else gets 404, so ids cannot be probed.
"""

import csv
import io
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.storage import generate_presigned_url, get_storage
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.contracts.lifecycle import party_of
from app.domains.contracts.models import Contract, ContractMilestone
from app.domains.deliverables.github import check_commit
from app.domains.deliverables.models import Deliverable
from app.domains.deliverables.schemas import (
    CodeDeliverableCreate,
    DeliverableResponse,
    DeliverableReview,
    DemoDeliverableCreate,
    DownloadLink,
)
from app.domains.deliverables.validation import check_document, safe_file_name
from app.domains.github.router import user_token
from app.services.notifications import notify_user

router = APIRouter(prefix="/contracts/{contract_id}/deliverables", tags=["Deliverables"])

DOWNLOAD_TTL_SECONDS = 600
_OPEN_MILESTONE_STATUSES = {"PENDING", "IN_PROGRESS", "DELIVERED"}


async def _contract_for_party(db: AsyncSession, contract_id: uuid.UUID, user: User) -> tuple[Contract, str]:
    contract = await db.get(Contract, contract_id)
    party = party_of(contract, user.id) if contract and not contract.is_deleted else None
    if contract is None or party is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    return contract, party


async def _prepare_submission(
    db: AsyncSession,
    contract: Contract,
    party: str,
    milestone_id: uuid.UUID,
    supersedes_id: uuid.UUID | None,
) -> int:
    """Check who may submit where; return the version number for the new row."""
    if party != "worker":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the professional on this contract submits deliverables")
    if contract.status != "ACTIVE":
        raise HTTPException(status.HTTP_409_CONFLICT, "Deliverables can only be submitted on an active, fully signed contract")
    milestone = await db.get(ContractMilestone, milestone_id)
    if milestone is None or milestone.contract_id != contract.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Milestone not found on this contract")
    if milestone.status not in _OPEN_MILESTONE_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "This milestone is already approved")
    if supersedes_id is None:
        return 1
    previous = await db.get(Deliverable, supersedes_id)
    if previous is None or previous.contract_id != contract.id or previous.milestone_id != milestone_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deliverable to revise not found")
    if previous.status == "ACCEPTED":
        raise HTTPException(status.HTTP_409_CONFLICT, "An accepted deliverable cannot be revised")
    if previous.status == "SUBMITTED":
        previous.status = "WITHDRAWN"
    return previous.version + 1


async def _announce(db: AsyncSession, contract: Contract, d: Deliverable) -> None:
    await notify_user(
        db,
        contract.client_id,
        "New deliverable submitted",
        f"{d.title} (v{d.version}) is ready for your review on {contract.title}.",
        "deliverable",
    )


@router.get("", response_model=list[DeliverableResponse])
async def list_deliverables(
    contract_id: uuid.UUID,
    milestone_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Deliverable]:
    await _contract_for_party(db, contract_id, current_user)
    query = select(Deliverable).where(Deliverable.contract_id == contract_id)
    if milestone_id is not None:
        query = query.where(Deliverable.milestone_id == milestone_id)
    rows = await db.execute(query.order_by(Deliverable.created_at.desc()).limit(200))
    return list(rows.scalars())


@router.post("/code", response_model=DeliverableResponse, status_code=status.HTTP_201_CREATED)
async def submit_code(
    contract_id: uuid.UUID,
    payload: CodeDeliverableCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Deliverable:
    contract, party = await _contract_for_party(db, contract_id, current_user)
    # Retrying the same submission returns the existing row instead of a duplicate.
    existing = await db.scalar(
        select(Deliverable).where(
            Deliverable.milestone_id == payload.milestone_id,
            Deliverable.commit_sha == payload.commit_sha,
            Deliverable.repo_url == payload.repo_url,
            Deliverable.status != "WITHDRAWN",
        )
    )
    if existing is not None and existing.contract_id == contract.id:
        return existing
    version = await _prepare_submission(db, contract, party, payload.milestone_id, payload.supersedes_id)
    d = Deliverable(
        contract_id=contract.id,
        milestone_id=payload.milestone_id,
        submitted_by_id=current_user.id,
        supersedes_id=payload.supersedes_id,
        kind="CODE",
        title=payload.title.strip(),
        notes=payload.notes,
        version=version,
        repo_url=payload.repo_url,
        branch=payload.branch,
        commit_sha=payload.commit_sha,
        # Not blocking: private repos and GitHub outages still allow submission.
        commit_check=await check_commit(payload.repo_url, payload.commit_sha, await user_token(db, current_user.id)),
    )
    db.add(d)
    await db.flush()
    await _announce(db, contract, d)
    return d


@router.post("/demo", response_model=DeliverableResponse, status_code=status.HTTP_201_CREATED)
async def submit_demo(
    contract_id: uuid.UUID,
    payload: DemoDeliverableCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Deliverable:
    contract, party = await _contract_for_party(db, contract_id, current_user)
    version = await _prepare_submission(db, contract, party, payload.milestone_id, payload.supersedes_id)
    d = Deliverable(
        contract_id=contract.id,
        milestone_id=payload.milestone_id,
        submitted_by_id=current_user.id,
        supersedes_id=payload.supersedes_id,
        kind="DEMO",
        title=payload.title.strip(),
        notes=payload.notes,
        version=version,
        demo_url=payload.demo_url,
        environment=(payload.environment or "").strip() or None,
    )
    db.add(d)
    await db.flush()
    await _announce(db, contract, d)
    return d


@router.post("/document", response_model=DeliverableResponse, status_code=status.HTTP_201_CREATED)
async def submit_document(
    contract_id: uuid.UUID,
    milestone_id: uuid.UUID = Form(...),
    title: str = Form(..., min_length=1, max_length=255),
    notes: str | None = Form(default=None, max_length=10_000),
    supersedes_id: uuid.UUID | None = Form(default=None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Deliverable:
    contract, party = await _contract_for_party(db, contract_id, current_user)
    version = await _prepare_submission(db, contract, party, milestone_id, supersedes_id)
    data = await file.read(15 * 1024 * 1024 + 1)
    name = safe_file_name(file.filename or "document")
    try:
        ext, mime = check_document(name, data)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    d = Deliverable(
        id=uuid.uuid4(),
        contract_id=contract.id,
        milestone_id=milestone_id,
        submitted_by_id=current_user.id,
        supersedes_id=supersedes_id,
        kind="DOCUMENT",
        title=title.strip(),
        notes=notes,
        version=version,
        file_name=name,
        file_mime=mime,
        file_size=len(data),
    )
    d.file_key = f"contracts/{contract.id}/{d.id}.{ext}"
    try:
        await get_storage().upload_file(settings.MINIO_BUCKET_DELIVERABLES, d.file_key, data, content_type=mime)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "File storage is unavailable; please try again later") from exc
    db.add(d)
    await db.flush()
    await _announce(db, contract, d)
    return d


async def _deliverable_for_party(
    db: AsyncSession, contract_id: uuid.UUID, deliverable_id: uuid.UUID, user: User
) -> tuple[Contract, str, Deliverable]:
    contract, party = await _contract_for_party(db, contract_id, user)
    d = await db.get(Deliverable, deliverable_id)
    if d is None or d.contract_id != contract.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deliverable not found")
    return contract, party, d


@router.get("/{deliverable_id}/download", response_model=DownloadLink)
async def download_document(
    contract_id: uuid.UUID,
    deliverable_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DownloadLink:
    _, _, d = await _deliverable_for_party(db, contract_id, deliverable_id, current_user)
    if d.kind != "DOCUMENT" or not d.file_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This deliverable has no file")
    url = generate_presigned_url(settings.MINIO_BUCKET_DELIVERABLES, d.file_key, expires_hours=DOWNLOAD_TTL_SECONDS / 3600)
    if not url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "File storage is unavailable; please try again later")
    return DownloadLink(url=url, expires_in_seconds=DOWNLOAD_TTL_SECONDS, file_name=d.file_name or "document")


PREVIEW_MAX_BYTES = 512 * 1024
PREVIEW_MAX_ROWS = 200


@router.get("/{deliverable_id}/preview")
async def preview_document(
    contract_id: uuid.UUID,
    deliverable_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """In-browser preview for text, Markdown and CSV. Office and PDF files are download-only:
    nothing is converted or executed on the server, and CSV cells are returned as plain text."""
    _, _, d = await _deliverable_for_party(db, contract_id, deliverable_id, current_user)
    ext = (d.file_name or "").rsplit(".", 1)[-1].lower()
    if d.kind != "DOCUMENT" or not d.file_key or ext not in {"txt", "md", "csv"}:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "No preview for this file type; download it instead")
    data = await get_storage().read_file(settings.MINIO_BUCKET_DELIVERABLES, d.file_key, PREVIEW_MAX_BYTES)
    if data is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "File storage is unavailable; please try again later")
    text = data.decode("utf-8", errors="replace")
    truncated = (d.file_size or 0) > PREVIEW_MAX_BYTES
    if ext != "csv":
        return {"kind": "text", "text": text, "truncated": truncated}
    rows = []
    for row in csv.reader(io.StringIO(text)):
        rows.append([cell[:500] for cell in row[:50]])
        if len(rows) >= PREVIEW_MAX_ROWS:
            truncated = True
            break
    return {"kind": "table", "rows": rows, "truncated": truncated}


@router.post("/{deliverable_id}/review", response_model=DeliverableResponse)
async def review_deliverable(
    contract_id: uuid.UUID,
    deliverable_id: uuid.UUID,
    payload: DeliverableReview,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Deliverable:
    contract, party, d = await _deliverable_for_party(db, contract_id, deliverable_id, current_user)
    if party != "client":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the client reviews deliverables")
    if d.status != "SUBMITTED":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Deliverable is {d.status.lower().replace('_', ' ')}")
    if payload.decision == "CHANGES_REQUESTED" and not (payload.note or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Say what needs to change")
    d.status = payload.decision
    d.review_note = payload.note
    d.reviewed_at = datetime.now(UTC)
    verdict = "accepted" if payload.decision == "ACCEPTED" else "sent back with change requests"
    await notify_user(db, contract.worker_id, "Deliverable reviewed", f"{d.title} (v{d.version}) was {verdict}.", "deliverable")
    return d


@router.post("/{deliverable_id}/withdraw", response_model=DeliverableResponse)
async def withdraw_deliverable(
    contract_id: uuid.UUID,
    deliverable_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Deliverable:
    _, party, d = await _deliverable_for_party(db, contract_id, deliverable_id, current_user)
    if party != "worker":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the submitter can withdraw a deliverable")
    if d.status != "SUBMITTED":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a deliverable awaiting review can be withdrawn")
    d.status = "WITHDRAWN"
    return d


async def count_open_deliverables(db: AsyncSession, contract_id: uuid.UUID) -> int:
    return int(
        await db.scalar(
            select(func.count()).select_from(Deliverable).where(
                Deliverable.contract_id == contract_id, Deliverable.status == "SUBMITTED"
            )
        )
        or 0
    )
