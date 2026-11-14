"""
Files application API.

    GET    /files                       list a folder or a view (mine, shared, recent, starred, trash, type:<group>, project:<id>, organisation:<id>)
    POST   /files/folders               create a folder
    POST   /files/upload                upload a file (multipart) into a folder / space -> node with version 1
    POST   /files/{id}/content          upload new content -> next version
    GET    /files/{id}                  metadata + breadcrumb + my role
    GET    /files/{id}/download         short-lived signed URL (private bucket)
    GET    /files/{id}/preview          bounded text preview or signed image URL
    GET    /files/{id}/versions         version history
    POST   /files/{id}/versions/{n}/restore
    PATCH  /files/{id}                  rename / move
    POST   /files/{id}/copy             copy (server-side object copy)
    DELETE /files/{id}                  move to trash
    POST   /files/{id}/restore          restore from trash
    DELETE /files/{id}/permanent        delete for good (owner)
    PUT    /files/{id}/star  DELETE /files/{id}/star
    GET/POST/DELETE /files/{id}/shares  user, project, organisation and link grants
    GET    /files/shared/{token}        link access: metadata + download URL (no sign-in)
    GET    /files/quota                 usage against the per-user cap

Every operation checks the caller's effective role (see access.py). Bytes never
leave the private bucket except through signed URLs that expire.
"""

import asyncio
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.storage import generate_presigned_url, get_s3_client, get_storage
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.companies.access import role_in
from app.domains.companies.models import CompanyProfile
from app.domains.deliverables.validation import safe_file_name
from app.domains.files.access import ancestors, can, effective_role, principals_for, role_for_link
from app.domains.files.models import (
    KIND_FILE,
    KIND_FOLDER,
    ROLES,
    TYPE_GROUPS,
    FileActivity,
    FileNode,
    FileShare,
    FileStar,
    FileVersion,
)
from app.domains.projects.models import Project
from app.domains.projects.router import require_project_access

router = APIRouter(prefix="/files", tags=["Files"])

DOWNLOAD_TTL_SECONDS = 300
PREVIEW_MAX_BYTES = 200_000
ALLOWED_MIME_PREFIXES = (
    "image/",
    "video/",
    "text/",
    "application/pdf",
    "application/json",
    "application/zip",
)
ALLOWED_MIME_EXACT = set(
    TYPE_GROUPS["documents"]
    + TYPE_GROUPS["spreadsheets"]
    + TYPE_GROUPS["presentations"]
    + TYPE_GROUPS["images"]
    + TYPE_GROUPS["videos"]
)
BLOCKED_EXTENSIONS = {
    "exe",
    "dll",
    "bat",
    "cmd",
    "sh",
    "ps1",
    "msi",
    "scr",
    "com",
    "jar",
    "app",
    "dmg",
    "vbs",
    "js",
    "docm",
    "xlsm",
    "pptm",
}


# ── schemas ──────────────────────────────────────────────────────────────────


class FolderIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    company_id: uuid.UUID | None = None


class NodePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: uuid.UUID | None = None
    move_to_root: bool = False


class ShareIn(BaseModel):
    principal_type: str = Field(pattern="^(user|project|organisation|link)$")
    principal_id: uuid.UUID | None = None
    email: str | None = None
    role: str = Field(default="viewer", pattern="^(viewer|commenter|editor)$")
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class NodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    parent_id: uuid.UUID | None
    owner_id: uuid.UUID
    project_id: uuid.UUID | None
    company_id: uuid.UUID | None
    kind: str
    name: str
    mime: str | None
    size: int
    current_version: int
    trashed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    starred: bool = False
    role: str | None = None


class NodeDetail(NodeOut):
    breadcrumb: list[dict[str, Any]] = []


class VersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    version: int
    size: int
    mime: str
    created_by: uuid.UUID | None
    created_at: datetime


class ShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    principal_type: str
    principal_id: uuid.UUID | None
    role: str
    token: str | None
    expires_at: datetime | None
    created_at: datetime


class DownloadLink(BaseModel):
    url: str
    expires_in: int


# ── helpers ──────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(UTC)


def _bucket() -> str:
    return settings.FILES_BUCKET


def _primary() -> str:
    """Files bucket on the primary provider (R2 name when STORAGE_PROVIDER=r2)."""
    from app.core.storage import primary_bucket

    return primary_bucket(settings.FILES_BUCKET)


def _key(node_id: uuid.UUID, version: int, name: str) -> str:
    return f"files/{node_id}/v{version}/{safe_file_name(name)}"


def _check_type(name: str, mime: str, size: int) -> str:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext in BLOCKED_EXTENSIONS:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "This file type is not accepted"
        )
    mime = (mime or "application/octet-stream").split(";")[0].strip().lower()
    if mime not in ALLOWED_MIME_EXACT and not mime.startswith(ALLOWED_MIME_PREFIXES):
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"Content type {mime} is not accepted"
        )
    if size <= 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "File is empty")
    if size > settings.FILES_MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            f"Files are limited to {settings.FILES_MAX_UPLOAD_MB} MB",
        )
    return mime


async def _node(
    db: AsyncSession, node_id: uuid.UUID, user: User | None, needed: str
) -> tuple[FileNode, str]:
    node = await db.get(FileNode, node_id)
    if node is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    role = await effective_role(db, node, user)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    if not can(role, needed):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your access does not allow this")
    return node, role


async def _used_bytes(db: AsyncSession, owner_id: uuid.UUID) -> int:
    total = await db.scalar(
        select(func.coalesce(func.sum(FileVersion.size), 0))
        .join(FileNode, FileNode.id == FileVersion.node_id)
        .where(FileNode.owner_id == owner_id)
    )
    return int(total or 0)


async def _enforce_quota(db: AsyncSession, owner_id: uuid.UUID, incoming: int) -> None:
    cap = settings.FILES_USER_QUOTA_MB * 1024 * 1024
    if await _used_bytes(db, owner_id) + incoming > cap:
        raise HTTPException(
            status.HTTP_507_INSUFFICIENT_STORAGE,
            f"Storage quota of {settings.FILES_USER_QUOTA_MB} MB reached",
        )


async def _space_for(
    db: AsyncSession,
    user: User,
    parent_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
    company_id: uuid.UUID | None,
) -> tuple[FileNode | None, uuid.UUID | None, uuid.UUID | None, uuid.UUID]:
    """Validate the destination and return (parent, project_id, company_id, owner_id)."""
    if parent_id is not None:
        parent, role = await _node(db, parent_id, user, "editor")
        if parent.kind != KIND_FOLDER or parent.trashed_at is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Destination is not an active folder")
        return parent, parent.project_id, parent.company_id, parent.owner_id
    if project_id is not None:
        await require_project_access(project_id, user, db)
        return None, project_id, None, user.id
    if company_id is not None:
        company = await db.get(CompanyProfile, company_id)
        if company is None or await role_in(db, company, user.id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
        return None, None, company_id, user.id
    return None, None, None, user.id


async def _log(
    db: AsyncSession,
    node: FileNode,
    user: User | None,
    action: str,
    payload: dict[str, Any] | None = None,
) -> None:
    db.add(
        FileActivity(
            node_id=node.id,
            actor_id=user.id if user else None,
            action=action,
            payload=payload or {},
        )
    )


async def _out(
    db: AsyncSession,
    nodes: list[FileNode],
    user: User,
    roles: dict[uuid.UUID, str | None] | None = None,
) -> list[NodeOut]:
    if not nodes:
        return []
    starred = set(
        (
            await db.execute(
                select(FileStar.node_id).where(
                    FileStar.user_id == user.id, FileStar.node_id.in_([n.id for n in nodes])
                )
            )
        ).scalars()
    )
    out = []
    for n in nodes:
        # onupdate columns expire after flush; load them here, inside the async
        # context, so Pydantic never triggers lazy IO (MissingGreenlet).
        await db.refresh(n)
        item = NodeOut.model_validate(n)
        item.starred = n.id in starred
        item.role = (roles or {}).get(n.id)
        out.append(item)
    return out


async def _accessible_filter(db: AsyncSession, user: User):
    """SQL predicate for nodes the user can reach without walking ancestors:
    owned, in a project/org they belong to, or directly shared (inheritance is
    applied when the folder itself is opened)."""
    p = await principals_for(db, user)
    shared_nodes = select(FileShare.node_id).where(
        FileShare.principal_type != "link",
        or_(
            *[
                (FileShare.principal_type == kind) & FileShare.principal_id.in_(ids)
                for kind, ids in p.items()
                if ids
            ]
        ),
    )
    clauses = [FileNode.owner_id == user.id, FileNode.id.in_(shared_nodes)]
    if p["project"]:
        clauses.append(FileNode.project_id.in_(p["project"]))
    if p["organisation"]:
        clauses.append(FileNode.company_id.in_(p["organisation"]))
    return or_(*clauses)


# ── listing ──────────────────────────────────────────────────────────────────


@router.get("", response_model=list[NodeOut])
async def list_nodes(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    parent_id: uuid.UUID | None = None,
    view: str = Query(default="mine", max_length=60),
    sort: str = Query(default="name", pattern="^(name|updated|size)$"),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[NodeOut]:
    active = FileNode.trashed_at.is_(None)
    order = {
        "name": (FileNode.kind.desc(), FileNode.name),
        "updated": (FileNode.updated_at.desc(),),
        "size": (FileNode.size.desc(),),
    }[sort]
    if parent_id is not None:
        parent, role = await _node(db, parent_id, user, "viewer")
        rows = (
            (
                await db.execute(
                    select(FileNode)
                    .where(FileNode.parent_id == parent_id, active)
                    .order_by(*order)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return await _out(db, list(rows), user, {n.id: role for n in rows})
    if view == "mine":
        stmt = select(FileNode).where(
            FileNode.owner_id == user.id,
            FileNode.parent_id.is_(None),
            FileNode.project_id.is_(None),
            FileNode.company_id.is_(None),
            active,
        )
    elif view == "shared":
        p = await principals_for(db, user)
        shared_ids = select(FileShare.node_id).where(
            FileShare.principal_type != "link",
            or_(
                *[
                    (FileShare.principal_type == k) & FileShare.principal_id.in_(v)
                    for k, v in p.items()
                    if v
                ]
            ),
        )
        stmt = select(FileNode).where(
            FileNode.id.in_(shared_ids), FileNode.owner_id != user.id, active
        )
    elif view == "recent":
        stmt = (
            select(FileNode)
            .where(await _accessible_filter(db, user), FileNode.kind == KIND_FILE, active)
            .order_by(FileNode.updated_at.desc())
        )
        order = ()
    elif view == "starred":
        stmt = (
            select(FileNode)
            .join(FileStar, FileStar.node_id == FileNode.id)
            .where(FileStar.user_id == user.id, active)
        )
    elif view == "trash":
        stmt = (
            select(FileNode)
            .where(FileNode.owner_id == user.id, FileNode.trashed_at.is_not(None))
            .order_by(FileNode.trashed_at.desc())
        )
        order = ()
    elif view.startswith("type:"):
        group = view.split(":", 1)[1]
        mimes = TYPE_GROUPS.get(group)
        if not mimes:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown type group")
        stmt = select(FileNode).where(
            await _accessible_filter(db, user), FileNode.mime.in_(mimes), active
        )
    elif view.startswith("project:"):
        project_id = uuid.UUID(view.split(":", 1)[1])
        await require_project_access(project_id, user, db)
        stmt = select(FileNode).where(
            FileNode.project_id == project_id, FileNode.parent_id.is_(None), active
        )
    elif view.startswith("organisation:"):
        company_id = uuid.UUID(view.split(":", 1)[1])
        company = await db.get(CompanyProfile, company_id)
        if company is None or await role_in(db, company, user.id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
        stmt = select(FileNode).where(
            FileNode.company_id == company_id, FileNode.parent_id.is_(None), active
        )
    else:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown view")
    if order:
        stmt = stmt.order_by(*order)
    rows = list((await db.execute(stmt.limit(limit))).scalars().all())
    if view == "trash":
        # Only top-most trashed items: children of a trashed folder travel with it.
        trashed_ids = {n.id for n in rows}
        rows = [n for n in rows if n.parent_id not in trashed_ids]
    roles = (
        {n.id: (await effective_role(db, n, user)) for n in rows}
        if view in {"shared", "recent", "starred"} or view.startswith("type:")
        else None
    )
    return await _out(db, rows, user, roles)


@router.get("/quota")
async def quota(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, int]:
    used = await _used_bytes(db, user.id)
    return {
        "used_bytes": used,
        "limit_bytes": settings.FILES_USER_QUOTA_MB * 1024 * 1024,
        "max_upload_bytes": settings.FILES_MAX_UPLOAD_MB * 1024 * 1024,
    }


@router.get("/shared/{token}")
async def open_link(token: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    share = (
        await db.execute(
            select(FileShare).where(FileShare.token == token, FileShare.principal_type == "link")
        )
    ).scalar_one_or_none()
    if share is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")
    node = await db.get(FileNode, share.node_id)
    if node is None or node.trashed_at is not None or await role_for_link(db, node, token) is None:
        raise HTTPException(status.HTTP_410_GONE, "This link has expired")
    url = None
    if node.kind == KIND_FILE and node.object_key:
        url = generate_presigned_url(
            _bucket(), node.object_key, expires_hours=DOWNLOAD_TTL_SECONDS / 3600
        )
    return {
        "name": node.name,
        "kind": node.kind,
        "mime": node.mime,
        "size": node.size,
        "download_url": url,
        "expires_in": DOWNLOAD_TTL_SECONDS,
    }


# ── create ───────────────────────────────────────────────────────────────────


@router.post("/folders", response_model=NodeOut, status_code=status.HTTP_201_CREATED)
async def create_folder(
    body: FolderIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> NodeOut:
    parent, project_id, company_id, owner_id = await _space_for(
        db, user, body.parent_id, body.project_id, body.company_id
    )
    node = FileNode(
        parent_id=parent.id if parent else None,
        owner_id=owner_id,
        project_id=project_id,
        company_id=company_id,
        kind=KIND_FOLDER,
        name=body.name.strip(),
    )
    db.add(node)
    await db.flush()
    await _log(db, node, user, "folder.created")
    await db.flush()
    return (await _out(db, [node], user, {node.id: "owner" if owner_id == user.id else "editor"}))[
        0
    ]


async def _store_version(
    db: AsyncSession, node: FileNode, user: User, data: bytes, mime: str
) -> FileVersion:
    version = node.current_version + 1
    key = _key(node.id, version, node.name)
    await get_storage().upload_file(_bucket(), key, data, content_type=mime)
    fv = FileVersion(
        node_id=node.id,
        version=version,
        object_key=key,
        size=len(data),
        mime=mime,
        created_by=user.id,
    )
    db.add(fv)
    node.current_version = version
    node.object_key = key
    node.size = len(data)
    node.mime = mime
    await db.flush()
    return fv


@router.post("/upload", response_model=NodeOut, status_code=status.HTTP_201_CREATED)
async def upload(
    file: UploadFile = File(...),
    parent_id: uuid.UUID | None = Form(default=None),
    project_id: uuid.UUID | None = Form(default=None),
    company_id: uuid.UUID | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NodeOut:
    data = await file.read(settings.FILES_MAX_UPLOAD_MB * 1024 * 1024 + 1)
    name = safe_file_name(file.filename or "upload")
    mime = _check_type(name, file.content_type or "", len(data))
    parent, p_id, c_id, owner_id = await _space_for(db, user, parent_id, project_id, company_id)
    await _enforce_quota(db, owner_id, len(data))
    node = FileNode(
        parent_id=parent.id if parent else None,
        owner_id=owner_id,
        project_id=p_id,
        company_id=c_id,
        kind=KIND_FILE,
        name=name,
        mime=mime,
        size=0,
    )
    db.add(node)
    await db.flush()
    await _store_version(db, node, user, data, mime)
    await _log(db, node, user, "uploaded", {"size": len(data), "version": 1})
    await db.flush()
    return (await _out(db, [node], user, {node.id: "owner" if owner_id == user.id else "editor"}))[
        0
    ]


@router.post("/{node_id}/content", response_model=NodeOut)
async def upload_new_version(
    node_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NodeOut:
    node, role = await _node(db, node_id, user, "editor")
    if node.kind != KIND_FILE or node.trashed_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Not an active file")
    data = await file.read(settings.FILES_MAX_UPLOAD_MB * 1024 * 1024 + 1)
    mime = _check_type(node.name, file.content_type or node.mime or "", len(data))
    await _enforce_quota(db, node.owner_id, len(data))
    fv = await _store_version(db, node, user, data, mime)
    await _log(db, node, user, "new_version", {"version": fv.version, "size": len(data)})
    await db.flush()
    return (await _out(db, [node], user, {node.id: role}))[0]


# ── read ─────────────────────────────────────────────────────────────────────


@router.get("/{node_id}", response_model=NodeDetail)
async def get_node(
    node_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> NodeDetail:
    node, role = await _node(db, node_id, user, "viewer")
    chain = await ancestors(db, node)
    detail = NodeDetail.model_validate(node)
    detail.role = role
    detail.starred = (await db.get(FileStar, (node.id, user.id))) is not None
    detail.breadcrumb = [{"id": str(n.id), "name": n.name} for n in reversed(chain[1:])]
    return detail


@router.get("/{node_id}/download", response_model=DownloadLink)
async def download(
    node_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> DownloadLink:
    node, _ = await _node(db, node_id, user, "viewer")
    if any(n.trashed_at is not None for n in await ancestors(db, node)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    if node.kind != KIND_FILE or not node.object_key:
        raise HTTPException(status.HTTP_409_CONFLICT, "Folders cannot be downloaded")
    url = generate_presigned_url(
        _bucket(), node.object_key, expires_hours=DOWNLOAD_TTL_SECONDS / 3600
    )
    if not url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Storage is unavailable")
    await _log(db, node, user, "downloaded")
    return DownloadLink(url=url, expires_in=DOWNLOAD_TTL_SECONDS)


@router.get("/{node_id}/preview")
async def preview(
    node_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    node, _ = await _node(db, node_id, user, "viewer")
    if any(n.trashed_at is not None for n in await ancestors(db, node)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    if node.kind != KIND_FILE or not node.object_key:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nothing to preview")
    mime = node.mime or ""
    if mime.startswith("image/") or mime == "application/pdf" or mime.startswith("video/"):
        url = generate_presigned_url(
            _bucket(), node.object_key, expires_hours=DOWNLOAD_TTL_SECONDS / 3600
        )
        if not url:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Storage is unavailable")
        return {"kind": "url", "mime": mime, "url": url, "expires_in": DOWNLOAD_TTL_SECONDS}
    from app.domains.files.office_preview import (
        MAX_ARCHIVE_BYTES,
        OFFICE_MIMES,
        OfficePreviewError,
        extract_office_preview,
    )

    if mime in OFFICE_MIMES:
        data = await get_storage().read_file(_bucket(), node.object_key, MAX_ARCHIVE_BYTES + 1)
        if data is None:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Storage is unavailable")
        try:
            office = await asyncio.to_thread(extract_office_preview, data, mime)
        except OfficePreviewError:
            return {
                "kind": "none",
                "mime": mime,
                "reason": "This file cannot be previewed safely. Download it to open it.",
            }
        return {"kind": "text", "mime": mime, "text": office.text, "truncated": office.truncated}
    if mime.startswith("text/") or mime == "application/json":
        data = await get_storage().read_file(_bucket(), node.object_key, PREVIEW_MAX_BYTES)
        if data is None:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Storage is unavailable")
        return {
            "kind": "text",
            "mime": mime,
            "text": data.decode("utf-8", "replace"),
            "truncated": node.size > PREVIEW_MAX_BYTES,
        }
    return {
        "kind": "none",
        "mime": mime,
        "reason": "Preview is not available for this type; download the file.",
    }


@router.get("/{node_id}/versions", response_model=list[VersionOut])
async def versions(
    node_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[FileVersion]:
    node, _ = await _node(db, node_id, user, "viewer")
    return list(
        (
            await db.execute(
                select(FileVersion)
                .where(FileVersion.node_id == node.id)
                .order_by(FileVersion.version.desc())
            )
        )
        .scalars()
        .all()
    )


@router.post("/{node_id}/versions/{version}/restore", response_model=NodeOut)
async def restore_version(
    node_id: uuid.UUID,
    version: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NodeOut:
    node, role = await _node(db, node_id, user, "editor")
    old = (
        await db.execute(
            select(FileVersion).where(
                FileVersion.node_id == node.id, FileVersion.version == version
            )
        )
    ).scalar_one_or_none()
    if old is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")
    new_version = node.current_version + 1
    new_key = _key(node.id, new_version, node.name)
    client = get_s3_client()
    try:
        await asyncio.to_thread(
            client.copy_object,
            Bucket=_primary(),
            Key=new_key,
            CopySource={"Bucket": _primary(), "Key": old.object_key},
        )
    except Exception as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Storage is unavailable") from exc
    db.add(
        FileVersion(
            node_id=node.id,
            version=new_version,
            object_key=new_key,
            size=old.size,
            mime=old.mime,
            created_by=user.id,
        )
    )
    node.current_version = new_version
    node.object_key = new_key
    node.size = old.size
    node.mime = old.mime
    await _log(db, node, user, "version_restored", {"from": version, "to": new_version})
    await db.flush()
    return (await _out(db, [node], user, {node.id: role}))[0]


# ── change ───────────────────────────────────────────────────────────────────


async def _is_descendant(db: AsyncSession, candidate: FileNode, ancestor_id: uuid.UUID) -> bool:
    return any(n.id == ancestor_id for n in await ancestors(db, candidate))


@router.patch("/{node_id}", response_model=NodeOut)
async def update_node(
    node_id: uuid.UUID,
    body: NodePatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NodeOut:
    node, role = await _node(db, node_id, user, "editor")
    if node.trashed_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Restore the item before changing it")
    changes: dict[str, Any] = {}
    if body.name is not None and body.name.strip() != node.name:
        changes["name"] = {"from": node.name, "to": body.name.strip()}
        node.name = (
            safe_file_name(body.name.strip()) if node.kind == KIND_FILE else body.name.strip()
        )
    if body.move_to_root or body.parent_id is not None:
        if body.parent_id is not None:
            target, _ = await _node(db, body.parent_id, user, "editor")
            if target.kind != KIND_FOLDER or target.trashed_at is not None:
                raise HTTPException(status.HTTP_409_CONFLICT, "Destination is not an active folder")
            if target.id == node.id or await _is_descendant(db, target, node.id):
                raise HTTPException(
                    status.HTTP_409_CONFLICT, "A folder cannot be moved into itself"
                )
            node.parent_id = target.id
            node.project_id = target.project_id
            node.company_id = target.company_id
            changes["moved_to"] = str(target.id)
        else:
            if not can(role, "owner") and node.owner_id != user.id:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN, "Only the owner can move an item to their root"
                )
            node.parent_id = None
            changes["moved_to"] = "root"
    if changes:
        await _log(db, node, user, "changed", changes)
    await db.flush()
    return (await _out(db, [node], user, {node.id: role}))[0]


@router.post("/{node_id}/copy", response_model=NodeOut, status_code=status.HTTP_201_CREATED)
async def copy_node(
    node_id: uuid.UUID,
    body: NodePatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NodeOut:
    node, _ = await _node(db, node_id, user, "viewer")
    if any(n.trashed_at is not None for n in await ancestors(db, node)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    if node.kind != KIND_FILE or not node.object_key:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only files can be copied")
    parent, p_id, c_id, owner_id = await _space_for(db, user, body.parent_id, None, None)
    await _enforce_quota(db, owner_id, node.size)
    name = body.name.strip() if body.name else f"Copy of {node.name}"
    clone = FileNode(
        parent_id=parent.id if parent else None,
        owner_id=owner_id,
        project_id=p_id,
        company_id=c_id,
        kind=KIND_FILE,
        name=safe_file_name(name),
        mime=node.mime,
        size=node.size,
        current_version=1,
    )
    db.add(clone)
    await db.flush()
    key = _key(clone.id, 1, clone.name)
    try:
        await asyncio.to_thread(
            get_s3_client().copy_object,
            Bucket=_primary(),
            Key=key,
            CopySource={"Bucket": _primary(), "Key": node.object_key},
        )
    except Exception as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Storage is unavailable") from exc
    clone.object_key = key
    db.add(
        FileVersion(
            node_id=clone.id,
            version=1,
            object_key=key,
            size=node.size,
            mime=node.mime or "application/octet-stream",
            created_by=user.id,
        )
    )
    await _log(db, clone, user, "copied", {"from": str(node.id)})
    await db.flush()
    return (await _out(db, [clone], user, {clone.id: "owner"}))[0]


@router.delete("/{node_id}", response_model=NodeOut)
async def trash(
    node_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> NodeOut:
    node, role = await _node(db, node_id, user, "editor")
    if node.trashed_at is None:
        now = _now()
        node.trashed_at = now
        await _trash_children(db, node, now)
        await _log(db, node, user, "trashed")
        await db.flush()
    return (await _out(db, [node], user, {node.id: role}))[0]


async def _trash_children(db: AsyncSession, node: FileNode, when: datetime | None) -> None:
    stack = [node.id]
    while stack:
        pid = stack.pop()
        children = (
            (await db.execute(select(FileNode).where(FileNode.parent_id == pid))).scalars().all()
        )
        for child in children:
            child.trashed_at = when
            stack.append(child.id)


@router.post("/{node_id}/restore", response_model=NodeOut)
async def restore(
    node_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> NodeOut:
    node, role = await _node(db, node_id, user, "editor")
    if node.trashed_at is None:
        return (await _out(db, [node], user, {node.id: role}))[0]
    if node.parent_id is not None:
        parent = await db.get(FileNode, node.parent_id)
        if parent is None or parent.trashed_at is not None:
            node.parent_id = None  # parent gone: restore at the space root
    node.trashed_at = None
    await _trash_children(db, node, None)
    await _log(db, node, user, "restored")
    await db.flush()
    return (await _out(db, [node], user, {node.id: role}))[0]


@router.delete("/{node_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def delete_permanently(
    node_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> None:
    node, role = await _node(db, node_id, user, "owner")
    if node.trashed_at is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Move the item to the trash first")
    await purge_node(db, node)


async def purge_node(db: AsyncSession, node: FileNode) -> int:
    """Delete a node, its descendants and every stored object. Returns objects removed."""
    removed = 0
    stack = [node]
    nodes: list[FileNode] = []
    while stack:
        current = stack.pop()
        nodes.append(current)
        stack.extend(
            (await db.execute(select(FileNode).where(FileNode.parent_id == current.id)))
            .scalars()
            .all()
        )
    storage = get_storage()
    for n in nodes:
        keys = (
            (await db.execute(select(FileVersion.object_key).where(FileVersion.node_id == n.id)))
            .scalars()
            .all()
        )
        for key in keys:
            if await storage.delete_file(_bucket(), key):
                removed += 1
    for n in reversed(nodes):
        await db.delete(n)
    await db.flush()
    return removed


# ── stars and shares ─────────────────────────────────────────────────────────


@router.put("/{node_id}/star", status_code=status.HTTP_204_NO_CONTENT)
async def star(
    node_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> None:
    node, _ = await _node(db, node_id, user, "viewer")
    if await db.get(FileStar, (node.id, user.id)) is None:
        db.add(FileStar(node_id=node.id, user_id=user.id))
        await db.flush()


@router.delete("/{node_id}/star", status_code=status.HTTP_204_NO_CONTENT)
async def unstar(
    node_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> None:
    node, _ = await _node(db, node_id, user, "viewer")
    existing = await db.get(FileStar, (node.id, user.id))
    if existing is not None:
        await db.delete(existing)
        await db.flush()


@router.get("/{node_id}/shares", response_model=list[ShareOut])
async def list_shares(
    node_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[FileShare]:
    node, _ = await _node(db, node_id, user, "editor")
    return list(
        (
            await db.execute(
                select(FileShare).where(FileShare.node_id == node.id).order_by(FileShare.created_at)
            )
        )
        .scalars()
        .all()
    )


@router.post("/{node_id}/shares", response_model=ShareOut, status_code=status.HTTP_201_CREATED)
async def add_share(
    node_id: uuid.UUID,
    body: ShareIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileShare:
    node, role = await _node(db, node_id, user, "editor")
    if body.role not in ROLES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid role")
    principal_id = body.principal_id
    token = None
    if body.principal_type == "user":
        if body.email:
            target = await db.scalar(
                select(User).where(
                    User.email == body.email.strip().lower(), User.is_active.is_(True)
                )
            )
            if target is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "No active account with that email")
            principal_id = target.id
        if principal_id is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "A user id or email is required"
            )
        if principal_id == node.owner_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "The owner already has full access")
    elif body.principal_type == "project":
        if principal_id is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "project id required")
        await require_project_access(principal_id, user, db)
    elif body.principal_type == "organisation":
        if principal_id is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "organisation id required")
        company = await db.get(CompanyProfile, principal_id)
        if company is None or await role_in(db, company, user.id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
    else:  # link
        if body.role != "viewer":
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "Links can only grant viewing"
            )
        principal_id = None
        token = secrets.token_urlsafe(32)
    expires_at = _now() + timedelta(days=body.expires_in_days) if body.expires_in_days else None
    if body.principal_type != "link":
        existing = (
            await db.execute(
                select(FileShare).where(
                    FileShare.node_id == node.id,
                    FileShare.principal_type == body.principal_type,
                    FileShare.principal_id == principal_id,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            existing.role = body.role
            existing.expires_at = expires_at
            await db.flush()
            return existing
    share = FileShare(
        node_id=node.id,
        principal_type=body.principal_type,
        principal_id=principal_id,
        role=body.role,
        token=token,
        expires_at=expires_at,
        created_by=user.id,
    )
    db.add(share)
    await _log(db, node, user, "shared", {"principal_type": body.principal_type, "role": body.role})
    await db.flush()
    return share


@router.delete("/{node_id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_share(
    node_id: uuid.UUID,
    share_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    node, _ = await _node(db, node_id, user, "editor")
    share = await db.get(FileShare, share_id)
    if share is None or share.node_id != node.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
    await db.delete(share)
    await _log(db, node, user, "unshared", {"principal_type": share.principal_type})
    await db.flush()


# ── maintenance (worker) ─────────────────────────────────────────────────────


async def sweep_trash(db: AsyncSession, retention_days: int = 30) -> dict[str, int]:
    """Permanently delete items trashed longer than `retention_days`. Commits."""
    cutoff = _now() - timedelta(days=retention_days)
    rows = (
        (
            await db.execute(
                select(FileNode).where(
                    FileNode.trashed_at.is_not(None), FileNode.trashed_at < cutoff
                )
            )
        )
        .scalars()
        .all()
    )
    trashed_ids = {n.id for n in rows}
    roots = [n for n in rows if n.parent_id not in trashed_ids]
    nodes = 0
    objects = 0
    for root in roots:
        objects += await purge_node(db, root)
        nodes += 1
    await db.commit()
    return {"roots": nodes, "objects": objects}


# Referenced by workers/tests; keeps the Project import meaningful for type checkers.
__all__ = ["router", "sweep_trash", "purge_node", "Project"]


class FileCommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


@router.get("/{node_id}/comments")
async def file_comments(
    node_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    node, _ = await _node(db, node_id, user, "viewer")
    if node.trashed_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    rows = (
        (
            await db.execute(
                select(FileActivity)
                .where(FileActivity.node_id == node_id, FileActivity.action == "comment.added")
                .order_by(FileActivity.created_at.desc(), FileActivity.id.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": str(row.id),
            "author_id": str(row.actor_id) if row.actor_id else None,
            "body": row.payload.get("body", ""),
            "version": row.payload.get("version"),
            "created_at": row.created_at,
        }
        for row in reversed(rows)
    ]


@router.post("/{node_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_file_comment(
    node_id: uuid.UUID,
    body: FileCommentIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    node, _ = await _node(db, node_id, user, "commenter")
    if node.trashed_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    text = body.body.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Enter a comment")
    await _log(db, node, user, "comment.added", {"body": text, "version": node.current_version})
    await db.flush()
    return {"created": True}


class FileReviewIn(BaseModel):
    reviewer_id: uuid.UUID | None = None
    reviewer_email: str | None = Field(default=None, max_length=255)
    version: int = Field(ge=1)


class FileDecisionIn(BaseModel):
    decision: str = Field(pattern="^(approved|changes_requested)$")
    comment: str = Field(min_length=1, max_length=4000)


@router.get("/{node_id}/reviews")
async def file_reviews(
    node_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[dict[str, Any]]:
    node, _ = await _node(db, node_id, user, "viewer")
    if node.trashed_at is not None:
        raise HTTPException(404, "Not found")
    rows = (
        (
            await db.execute(
                select(FileActivity)
                .where(
                    FileActivity.node_id == node_id,
                    FileActivity.action.in_(["review.requested", "review.decided"]),
                )
                .order_by(FileActivity.created_at, FileActivity.id)
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": str(r.id),
            "actor_id": str(r.actor_id),
            "action": r.action,
            "created_at": r.created_at,
            **r.payload,
        }
        for r in rows
    ]


@router.post("/{node_id}/reviews", status_code=201)
async def request_file_review(
    node_id: uuid.UUID,
    body: FileReviewIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    node, _ = await _node(db, node_id, user, "editor")
    if node.kind != KIND_FILE or node.trashed_at is not None:
        raise HTTPException(409, "Choose an active file")
    if body.version != node.current_version:
        raise HTTPException(409, "The file changed; refresh before requesting review")
    reviewer = (
        await db.get(User, body.reviewer_id)
        if body.reviewer_id
        else await db.scalar(
            select(User).where(
                func.lower(User.email) == (body.reviewer_email or "").strip().lower()
            )
        )
    )
    if reviewer is not None and reviewer.id == user.id:
        raise HTTPException(422, "Choose another person to review your file")
    if (
        reviewer is None
        or not reviewer.is_active
        or not can(await effective_role(db, node, reviewer), "commenter")
    ):
        raise HTTPException(422, "Reviewer needs comment access to this file")
    row = FileActivity(
        node_id=node_id,
        actor_id=user.id,
        action="review.requested",
        payload={"reviewer_id": str(reviewer.id), "version": body.version},
    )
    db.add(row)
    await db.flush()
    return {"id": str(row.id), **row.payload}


@router.post("/{node_id}/reviews/{review_id}/decision")
async def decide_file_review(
    node_id: uuid.UUID,
    review_id: uuid.UUID,
    body: FileDecisionIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    node, _ = await _node(db, node_id, user, "commenter")
    row = await db.scalar(
        select(FileActivity)
        .where(
            FileActivity.id == review_id,
            FileActivity.node_id == node_id,
            FileActivity.action == "review.requested",
        )
        .with_for_update()
    )
    if row is None or row.payload.get("reviewer_id") != str(user.id):
        raise HTTPException(404, "Review not found")
    if node.trashed_at is not None or row.payload.get("version") != node.current_version:
        raise HTTPException(409, "This review is outdated; request review of the current version")
    decisions = (
        (
            await db.execute(
                select(FileActivity).where(
                    FileActivity.node_id == node_id,
                    FileActivity.action == "review.decided",
                )
            )
        )
        .scalars()
        .all()
    )
    if any(d.payload.get("review_id") == str(review_id) for d in decisions):
        raise HTTPException(409, "This review already has a decision")
    comment = body.comment.strip()
    if not comment:
        raise HTTPException(422, "Enter a review comment")
    await _log(
        db,
        node,
        user,
        "review.decided",
        {
            "review_id": str(review_id),
            "version": node.current_version,
            "decision": body.decision,
            "comment": comment,
        },
    )
    await db.flush()
    return {"decision": body.decision}
