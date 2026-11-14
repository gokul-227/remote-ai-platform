"""Owner-only organization and recovery. Folder placement never grants document access."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.documents.models import Document
from app.domains.files.models import FileFolder, FileLocation

router = APIRouter(prefix="/files", tags=["Files"])


class Destination(BaseModel):
    folder_id: uuid.UUID | None = None


class FolderCreate(Destination):
    name: str = Field(min_length=1, max_length=255)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = value.strip()
        if not value or value in {".", ".."} or any(ord(c) < 32 or c in "/\\" for c in value):
            raise ValueError("Enter a folder name without slashes or control characters")
        return value


async def _lock(db: AsyncSession, user: User) -> None:
    # Serialize structural changes per owner, including moves vs subtree trash.
    await db.scalar(select(User.id).where(User.id == user.id).with_for_update())


async def _folder(db: AsyncSession, user: User, fid: uuid.UUID, *, active: bool = True) -> FileFolder:
    folder = await db.get(FileFolder, fid)
    if folder is None or folder.owner_id != user.id or (active and folder.trash_batch):
        raise HTTPException(404, "Folder not found")
    return folder


async def _destination(db: AsyncSession, user: User, fid: uuid.UUID | None) -> None:
    if fid:
        await _folder(db, user, fid)


async def _document(db: AsyncSession, user: User, did: uuid.UUID) -> Document:
    doc = await db.scalar(select(Document).where(Document.id == did, Document.owner_id == user.id)
                          .with_for_update().execution_options(populate_existing=True))
    if doc is None:
        raise HTTPException(404, "File not found")
    return doc


def _folder_out(f: FileFolder) -> dict:
    return {"id": f.id, "name": f.name, "parent_id": f.parent_id, "trashed": bool(f.trash_batch)}


@router.get("")
async def browse(folder_id: uuid.UUID | None = None, trash: bool = False,
                 q: str = Query("", max_length=100), offset: int = Query(0, ge=0),
                 limit: int = Query(100, ge=1, le=200),
                 user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    if folder_id:
        await _folder(db, user, folder_id, active=not trash)
    folders = select(FileFolder).where(FileFolder.owner_id == user.id)
    folders = folders.where(FileFolder.trash_batch.is_not(None) if trash else FileFolder.trash_batch.is_(None))
    docs = select(Document, FileLocation).outerjoin(FileLocation, FileLocation.document_id == Document.id).where(
        Document.owner_id == user.id, Document.is_deleted == trash)
    if q.strip():
        folders = folders.where(FileFolder.name.icontains(q.strip(), autoescape=True))
        docs = docs.where(Document.title.icontains(q.strip(), autoescape=True))
    elif not trash:
        folders = folders.where(FileFolder.parent_id == folder_id)
        docs = docs.where(FileLocation.folder_id == folder_id)
    fs = (await db.scalars(folders.order_by(FileFolder.name, FileFolder.id).offset(offset).limit(limit + 1))).all()
    ds = (await db.execute(docs.order_by(Document.title, Document.id).offset(offset).limit(limit + 1))).all()
    return {"folders": [_folder_out(f) for f in fs[:limit]],
            "documents": [{"id": d.id, "title": d.title, "kind": d.kind,
                           "folder_id": loc.folder_id if loc else None, "trashed": d.is_deleted}
                          for d, loc in ds[:limit]],
            "has_more": len(fs) > limit or len(ds) > limit}


@router.post("/folders", status_code=201)
async def create_folder(payload: FolderCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    await _lock(db, user)
    await _destination(db, user, payload.folder_id)
    folder = FileFolder(owner_id=user.id, parent_id=payload.folder_id, name=payload.name)
    db.add(folder)
    await db.flush()
    return _folder_out(folder)


@router.patch("/folders/{fid}")
async def update_folder(fid: uuid.UUID, payload: FolderCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    await _lock(db, user)
    folder = await _folder(db, user, fid)
    await _destination(db, user, payload.folder_id)
    cursor = payload.folder_id
    seen = {fid}
    while cursor:
        if cursor in seen:
            raise HTTPException(409, "A folder cannot be moved inside itself")
        seen.add(cursor)
        cursor = (await _folder(db, user, cursor)).parent_id
    folder.name, folder.parent_id = payload.name, payload.folder_id
    await db.flush()
    return _folder_out(folder)


@router.put("/documents/{did}/location")
async def move_document(did: uuid.UUID, payload: Destination, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    await _lock(db, user)
    doc = await _document(db, user, did)
    if doc.is_deleted:
        raise HTTPException(409, "Restore the file before moving it")
    await _destination(db, user, payload.folder_id)
    loc = await db.get(FileLocation, did)
    if loc is None:
        loc = FileLocation(document_id=did)
        db.add(loc)
    loc.folder_id = payload.folder_id
    return {"id": did, "folder_id": payload.folder_id}


@router.post("/documents/{did}/trash")
async def trash_document(did: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    await _lock(db, user)
    doc = await _document(db, user, did)
    if not doc.is_deleted:
        doc.is_deleted = True
        loc = await db.get(FileLocation, did)
        if loc is None:
            loc = FileLocation(document_id=did)
            db.add(loc)
        loc.trash_batch = uuid.uuid4()
    return {"id": did}


@router.post("/documents/{did}/restore")
async def restore_document(did: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    await _lock(db, user)
    doc = await _document(db, user, did)
    loc = await db.get(FileLocation, did)
    if loc and loc.folder_id:
        await _folder(db, user, loc.folder_id)  # Restore parent first, never silently relocate.
    doc.is_deleted = False
    if loc:
        loc.trash_batch = None
    return {"id": did}


@router.post("/folders/{fid}/trash")
async def trash_folder(fid: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    await _lock(db, user)
    root = await _folder(db, user, fid, active=False)
    if root.trash_batch:
        return {"id": fid}
    folders = (await db.scalars(select(FileFolder).where(FileFolder.owner_id == user.id, FileFolder.trash_batch.is_(None)))).all()
    ids = {fid}
    while True:
        children = {f.id for f in folders if f.parent_id in ids} - ids
        if not children:
            break
        ids.update(children)
    batch = uuid.uuid4()
    for f in folders:
        if f.id in ids:
            f.trash_batch = batch
    rows = (await db.execute(select(Document, FileLocation).join(FileLocation, FileLocation.document_id == Document.id)
                            .where(Document.owner_id == user.id, Document.is_deleted.is_(False), FileLocation.folder_id.in_(ids))
                            .with_for_update())).all()
    for doc, loc in rows:
        doc.is_deleted, loc.trash_batch = True, batch
    return {"id": fid}


@router.post("/folders/{fid}/restore")
async def restore_folder(fid: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    await _lock(db, user)
    root = await _folder(db, user, fid, active=False)
    if root.parent_id:
        parent = await _folder(db, user, root.parent_id, active=False)
        if parent.trash_batch:
            raise HTTPException(409, "Restore the parent folder first")
    if root.trash_batch:
        batch = root.trash_batch
        folders = (await db.scalars(select(FileFolder).where(FileFolder.owner_id == user.id, FileFolder.trash_batch == batch))).all()
        for f in folders:
            f.trash_batch = None
        rows = (await db.execute(select(Document, FileLocation).join(FileLocation, FileLocation.document_id == Document.id)
                                .where(Document.owner_id == user.id, FileLocation.trash_batch == batch).with_for_update())).all()
        for doc, loc in rows:
            doc.is_deleted, loc.trash_batch = False, None
    return {"id": fid}
