"""
Documents domain FastAPI router — built-in Docs, Sheets and Slides.

Access, highest first: owner (everything) → EDIT share or a member of the
linked project / party to the linked contract (edit) → COMMENT share → VIEW
share. Everyone else gets 404. Saves need the version they were made from.
"""

import json
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.contracts.lifecycle import party_of
from app.domains.contracts.models import Contract
from app.domains.documents.models import Document, DocumentComment, DocumentShare, DocumentVersion
from app.domains.projects.models import Project
from app.domains.projects.router import can_access
from app.services.notifications import notify_user

router = APIRouter(prefix="/documents", tags=["Documents"])

MAX_CONTENT_BYTES = 1_000_000
KEEP_VERSIONS = 100
RANK = {"VIEW": 1, "COMMENT": 2, "EDIT": 3, "OWNER": 4}
EMPTY = {
    "DOC": {"type": "doc", "content": [{"type": "paragraph"}]},
    "SHEET": {"cells": {}, "cols": 26, "rows": 100},
    "SLIDES": {"slides": [{"title": "Title", "body": ""}]},
}


def _content(v: dict[str, Any]) -> dict[str, Any]:
    if len(json.dumps(v)) > MAX_CONTENT_BYTES:
        raise ValueError("content is larger than 1 MB")
    return v


class DocumentCreate(BaseModel):
    kind: Literal["DOC", "SHEET", "SLIDES"]
    title: str = Field(min_length=1, max_length=255)
    content: dict[str, Any] | None = None
    project_id: uuid.UUID | None = None
    contract_id: uuid.UUID | None = None

    _c = field_validator("content")(lambda cls, v: _content(v) if v is not None else v)


class DocumentSave(BaseModel):
    expected_version: int
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: dict[str, Any] | None = None

    _c = field_validator("content")(lambda cls, v: _content(v) if v is not None else v)


class ShareIn(BaseModel):
    user_id: uuid.UUID
    role: Literal["VIEW", "COMMENT", "EDIT"]


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    anchor: str | None = Field(default=None, max_length=255)


class DocumentSummary(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    owner_id: uuid.UUID
    project_id: uuid.UUID | None
    contract_id: uuid.UUID | None
    version: int
    updated_at: datetime
    my_role: str


class DocumentOut(DocumentSummary):
    content: dict[str, Any]


async def _role(db: AsyncSession, doc: Document, user: User) -> str | None:
    if doc.owner_id == user.id:
        return "OWNER"
    best = 0
    share = await db.scalar(
        select(DocumentShare).where(DocumentShare.document_id == doc.id, DocumentShare.user_id == user.id)
    )
    if share:
        best = RANK[share.role]
    if best < RANK["EDIT"] and doc.project_id:
        project = await db.get(Project, doc.project_id)
        if project is not None and await can_access(project, user, db):
            best = RANK["EDIT"]
    if best < RANK["EDIT"] and doc.contract_id:
        contract = await db.get(Contract, doc.contract_id)
        if contract is not None and not contract.is_deleted and party_of(contract, user.id):
            best = RANK["EDIT"]
    return next((k for k, v in RANK.items() if v == best), None) if best else None


async def _doc(db: AsyncSession, doc_id: uuid.UUID, user: User, need: str = "VIEW") -> tuple[Document, str]:
    doc = await db.get(Document, doc_id)
    role = await _role(db, doc, user) if doc and not doc.is_deleted else None
    if doc is None or role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    if RANK[role] < RANK[need]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"You need {need.lower()} access")
    return doc, role


def _summary(doc: Document, role: str) -> DocumentSummary:
    return DocumentSummary(
        id=doc.id, kind=doc.kind, title=doc.title, owner_id=doc.owner_id, project_id=doc.project_id,
        contract_id=doc.contract_id, version=doc.version, updated_at=doc.updated_at, my_role=role,
    )


def _out(doc: Document, role: str) -> DocumentOut:
    return DocumentOut(**_summary(doc, role).model_dump(), content=doc.content)


async def _snapshot(db: AsyncSession, doc: Document, author: uuid.UUID) -> None:
    db.add(DocumentVersion(document_id=doc.id, version=doc.version, title=doc.title, content=doc.content, author_id=author))
    await db.flush()
    old = (await db.execute(
        select(DocumentVersion).where(DocumentVersion.document_id == doc.id)
        .order_by(DocumentVersion.version.desc()).offset(KEEP_VERSIONS)
    )).scalars().all()
    for v in old:
        await db.delete(v)


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def create_document(
    payload: DocumentCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> DocumentOut:
    if payload.project_id:
        project = await db.get(Project, payload.project_id)
        if project is None or not await can_access(project, current_user, db):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if payload.contract_id:
        contract = await db.get(Contract, payload.contract_id)
        if contract is None or contract.is_deleted or not party_of(contract, current_user.id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    doc = Document(
        owner_id=current_user.id, kind=payload.kind, title=payload.title.strip(),
        content=payload.content or EMPTY[payload.kind], project_id=payload.project_id, contract_id=payload.contract_id,
    )
    db.add(doc)
    await db.flush()
    await _snapshot(db, doc, current_user.id)
    await db.refresh(doc)
    return _out(doc, "OWNER")


@router.get("", response_model=list[DocumentSummary])
async def list_documents(
    response: Response,
    kind: str | None = None,
    project_id: uuid.UUID | None = None,
    contract_id: uuid.UUID | None = None,
    q: str | None = Query(None, max_length=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DocumentSummary]:
    shared = select(DocumentShare.document_id).where(DocumentShare.user_id == current_user.id)
    query = select(Document).where(Document.is_deleted.is_(False))
    if project_id:
        query = query.where(Document.project_id == project_id)
    elif contract_id:
        query = query.where(Document.contract_id == contract_id)
    else:
        query = query.where(or_(Document.owner_id == current_user.id, Document.id.in_(shared)))
    if kind:
        query = query.where(Document.kind == kind)
    if q:
        query = query.where(Document.title.ilike(f"%{q.strip()}%"))
    out = []
    for doc in (await db.execute(query.order_by(Document.updated_at.desc()).limit(200))).scalars():
        role = await _role(db, doc, current_user)
        if role:
            out.append(_summary(doc, role))
    response.headers["X-Total-Count"] = str(len(out))
    return out


@router.get("/{doc_id}", response_model=DocumentOut)
async def get_document(doc_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> DocumentOut:
    doc, role = await _doc(db, doc_id, current_user)
    return _out(doc, role)


@router.put("/{doc_id}", response_model=DocumentOut)
async def save_document(
    doc_id: uuid.UUID, payload: DocumentSave, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> DocumentOut:
    doc, role = await _doc(db, doc_id, current_user, "EDIT")
    if payload.expected_version != doc.version:
        raise HTTPException(status.HTTP_409_CONFLICT, "Someone else saved a newer version; reload to see it")
    if payload.title is not None:
        doc.title = payload.title.strip()
    if payload.content is not None:
        doc.content = payload.content
    doc.version += 1
    doc.updated_at = datetime.now(UTC)
    await db.flush()
    await _snapshot(db, doc, current_user.id)
    await db.refresh(doc)
    return _out(doc, role)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(doc_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> None:
    doc, _ = await _doc(db, doc_id, current_user, "OWNER")
    doc.is_deleted = True


@router.get("/{doc_id}/versions")
async def list_versions(doc_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    doc, _ = await _doc(db, doc_id, current_user)
    rows = await db.execute(
        select(DocumentVersion, User.full_name).outerjoin(User, User.id == DocumentVersion.author_id)
        .where(DocumentVersion.document_id == doc.id).order_by(DocumentVersion.version.desc()).limit(KEEP_VERSIONS)
    )
    return [{"version": v.version, "title": v.title, "author": name, "created_at": v.created_at} for v, name in rows.all()]


@router.post("/{doc_id}/versions/{version}/restore", response_model=DocumentOut)
async def restore_version(
    doc_id: uuid.UUID, version: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> DocumentOut:
    doc, role = await _doc(db, doc_id, current_user, "EDIT")
    v = await db.scalar(select(DocumentVersion).where(DocumentVersion.document_id == doc.id, DocumentVersion.version == version))
    if v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")
    doc.title, doc.content = v.title, v.content
    doc.version += 1
    doc.updated_at = datetime.now(UTC)
    await db.flush()
    await _snapshot(db, doc, current_user.id)
    await db.refresh(doc)
    return _out(doc, role)


@router.get("/{doc_id}/shares")
async def list_shares(doc_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    doc, _ = await _doc(db, doc_id, current_user)
    rows = await db.execute(
        select(DocumentShare, User.full_name).join(User, User.id == DocumentShare.user_id).where(DocumentShare.document_id == doc.id)
    )
    return [{"user_id": str(s.user_id), "full_name": n, "role": s.role} for s, n in rows.all()]


@router.post("/{doc_id}/shares")
async def share_document(
    doc_id: uuid.UUID, payload: ShareIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    doc, _ = await _doc(db, doc_id, current_user, "OWNER")
    target = await db.get(User, payload.user_id)
    if target is None or not target.is_active or payload.user_id == current_user.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose another active member")
    share = await db.scalar(select(DocumentShare).where(DocumentShare.document_id == doc.id, DocumentShare.user_id == payload.user_id))
    if share is None:
        db.add(DocumentShare(document_id=doc.id, user_id=payload.user_id, role=payload.role))
        await notify_user(db, payload.user_id, "Document shared with you", f"{current_user.full_name or 'Someone'} shared “{doc.title}”.", "document")
    else:
        share.role = payload.role
    await db.flush()
    return {"user_id": str(payload.user_id), "role": payload.role}


@router.delete("/{doc_id}/shares/{user_id}")
async def unshare_document(
    doc_id: uuid.UUID, user_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    doc, _ = await _doc(db, doc_id, current_user, "OWNER")
    share = await db.scalar(select(DocumentShare).where(DocumentShare.document_id == doc.id, DocumentShare.user_id == user_id))
    if share is not None:
        await db.delete(share)
    return {"user_id": str(user_id), "role": None}


@router.get("/{doc_id}/comments")
async def list_comments(doc_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    doc, _ = await _doc(db, doc_id, current_user)
    rows = await db.execute(
        select(DocumentComment, User.full_name).outerjoin(User, User.id == DocumentComment.author_id)
        .where(DocumentComment.document_id == doc.id).order_by(DocumentComment.created_at, DocumentComment.id)
    )
    return [
        {"id": str(c.id), "author_id": str(c.author_id) if c.author_id else None, "author": n, "anchor": c.anchor,
         "body": c.body, "resolved": c.resolved, "created_at": c.created_at}
        for c, n in rows.all()
    ]


@router.post("/{doc_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(
    doc_id: uuid.UUID, payload: CommentIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    doc, _ = await _doc(db, doc_id, current_user, "COMMENT")
    c = DocumentComment(document_id=doc.id, author_id=current_user.id, anchor=payload.anchor, body=payload.body, created_at=datetime.now(UTC))
    db.add(c)
    await db.flush()
    if doc.owner_id != current_user.id:
        await notify_user(db, doc.owner_id, "New comment", f"{current_user.full_name or 'Someone'} commented on “{doc.title}”.", "document")
    return {"id": str(c.id)}


@router.post("/{doc_id}/comments/{comment_id}/resolve")
async def resolve_comment(
    doc_id: uuid.UUID, comment_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    doc, _ = await _doc(db, doc_id, current_user, "COMMENT")
    c = await db.get(DocumentComment, comment_id)
    if c is None or c.document_id != doc.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    c.resolved = True
    return {"id": str(c.id), "resolved": True}
