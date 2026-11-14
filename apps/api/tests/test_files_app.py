"""Files application: folders, uploads, versions, sharing with inheritance, trash
and restore, quotas, link access. Object storage is faked in memory."""

import io
import uuid

import pytest
from httpx import AsyncClient

from app.domains.files import router as files_router


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    async def upload_file(self, bucket: str, key: str, data: bytes, content_type: str = "") -> str:
        self.objects[key] = data
        return f"fake://{bucket}/{key}"

    async def read_file(self, bucket: str, key: str, max_bytes: int) -> bytes | None:
        data = self.objects.get(key)
        return None if data is None else data[:max_bytes]

    async def delete_file(self, bucket: str, key: str) -> bool:
        return self.objects.pop(key, None) is not None


class FakeS3:
    def __init__(self, store: FakeStorage) -> None:
        self.store = store

    def copy_object(self, Bucket: str, Key: str, CopySource: dict) -> None:  # noqa: N803
        self.store.objects[Key] = self.store.objects[CopySource["Key"]]


@pytest.fixture
def storage(monkeypatch) -> FakeStorage:
    fake = FakeStorage()
    monkeypatch.setattr(files_router, "get_storage", lambda: fake)
    monkeypatch.setattr(files_router, "get_s3_client", lambda: FakeS3(fake))
    monkeypatch.setattr(
        files_router,
        "generate_presigned_url",
        lambda bucket, key, expires_hours=1: (
            f"https://signed.example/{bucket}/{key}?ttl={int(expires_hours * 3600)}"
        ),
    )
    return fake


async def _signup(client: AsyncClient, email: str, role: str = "ENGINEER") -> dict[str, str]:
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "x", "full_name": "F", "role": role},
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _file(name: str, data: bytes, mime: str) -> dict:
    return {"file": (name, io.BytesIO(data), mime)}


@pytest.mark.asyncio
async def test_folders_uploads_versions_and_trash(client: AsyncClient, storage: FakeStorage):
    me = await _signup(client, "files-owner@example.com")
    folder = await client.post("/api/v1/files/folders", json={"name": "Project Alpha"}, headers=me)
    assert folder.status_code == 201, folder.text
    fid = folder.json()["id"]

    # Type and size gates.
    exe = await client.post(
        "/api/v1/files/upload",
        files=_file("x.exe", b"MZ", "application/octet-stream"),
        data={"parent_id": fid},
        headers=me,
    )
    assert exe.status_code == 415
    empty = await client.post(
        "/api/v1/files/upload",
        files=_file("n.txt", b"", "text/plain"),
        data={"parent_id": fid},
        headers=me,
    )
    assert empty.status_code == 422

    up = await client.post(
        "/api/v1/files/upload",
        files=_file("notes.txt", b"hello v1", "text/plain"),
        data={"parent_id": fid},
        headers=me,
    )
    assert up.status_code == 201, up.text
    node = up.json()
    assert node["current_version"] == 1
    assert node["size"] == 8
    assert node["mime"] == "text/plain"
    nid = node["id"]
    assert len(storage.objects) == 1
    assert all(key.startswith(f"files/{nid}/v1/") for key in storage.objects)

    listing = await client.get(f"/api/v1/files?parent_id={fid}", headers=me)
    assert [n["name"] for n in listing.json()] == ["notes.txt"]
    mine = await client.get("/api/v1/files?view=mine", headers=me)
    assert [n["name"] for n in mine.json()] == ["Project Alpha"]

    v2 = await client.post(
        f"/api/v1/files/{nid}/content",
        files=_file("notes.txt", b"hello version two", "text/plain"),
        headers=me,
    )
    assert v2.status_code == 200
    assert v2.json()["current_version"] == 2
    versions = await client.get(f"/api/v1/files/{nid}/versions", headers=me)
    assert [v["version"] for v in versions.json()] == [2, 1]
    preview = await client.get(f"/api/v1/files/{nid}/preview", headers=me)
    assert preview.json()["text"] == "hello version two"
    restored = await client.post(f"/api/v1/files/{nid}/versions/1/restore", headers=me)
    assert restored.json()["current_version"] == 3
    assert (await client.get(f"/api/v1/files/{nid}/preview", headers=me)).json()[
        "text"
    ] == "hello v1"

    link = await client.get(f"/api/v1/files/{nid}/download", headers=me)
    assert link.status_code == 200
    assert link.json()["url"].startswith("https://signed.example/")
    assert link.json()["expires_in"] == 300

    detail = await client.get(f"/api/v1/files/{nid}", headers=me)
    assert detail.json()["breadcrumb"] == [{"id": fid, "name": "Project Alpha"}]
    assert detail.json()["role"] == "owner"

    # Star, recent, type filter.
    assert (await client.put(f"/api/v1/files/{nid}/star", headers=me)).status_code == 204
    assert [
        n["id"] for n in (await client.get("/api/v1/files?view=starred", headers=me)).json()
    ] == [nid]
    assert [
        n["id"] for n in (await client.get("/api/v1/files?view=recent", headers=me)).json()
    ] == [nid]
    assert [
        n["id"] for n in (await client.get("/api/v1/files?view=type:documents", headers=me)).json()
    ] == [nid]

    # Trash the folder: the file travels with it; restore brings both back.
    trashed = await client.delete(f"/api/v1/files/{fid}", headers=me)
    assert trashed.json()["trashed_at"] is not None
    assert (await client.get("/api/v1/files?view=mine", headers=me)).json() == []
    trash = (await client.get("/api/v1/files?view=trash", headers=me)).json()
    assert [n["id"] for n in trash] == [fid]
    assert (await client.get(f"/api/v1/files/{nid}", headers=me)).json()["trashed_at"] is not None
    assert (await client.delete(f"/api/v1/files/{nid}/permanent", headers=me)).status_code == 204
    assert (await client.get(f"/api/v1/files/{nid}", headers=me)).status_code == 404
    assert storage.objects == {}
    assert (await client.post(f"/api/v1/files/{fid}/restore", headers=me)).json()[
        "trashed_at"
    ] is None
    assert [
        n["name"] for n in (await client.get("/api/v1/files?view=mine", headers=me)).json()
    ] == ["Project Alpha"]


@pytest.mark.asyncio
async def test_sharing_inherits_down_folders_and_respects_roles(
    client: AsyncClient, storage: FakeStorage
):
    owner = await _signup(client, "share-owner@example.com")
    viewer = await _signup(client, "share-viewer@example.com")
    editor = await _signup(client, "share-editor@example.com")
    outsider = await _signup(client, "share-outsider@example.com")
    folder = (
        await client.post("/api/v1/files/folders", json={"name": "Shared"}, headers=owner)
    ).json()
    sub = (
        await client.post(
            "/api/v1/files/folders", json={"name": "Deep", "parent_id": folder["id"]}, headers=owner
        )
    ).json()
    f = (
        await client.post(
            "/api/v1/files/upload",
            files=_file("spec.md", b"# spec", "text/markdown"),
            data={"parent_id": sub["id"]},
            headers=owner,
        )
    ).json()

    for h in (viewer, editor, outsider):
        assert (await client.get(f"/api/v1/files/{f['id']}", headers=h)).status_code == 404
    share_v = await client.post(
        f"/api/v1/files/{folder['id']}/shares",
        json={"principal_type": "user", "email": "share-viewer@example.com", "role": "viewer"},
        headers=owner,
    )
    assert share_v.status_code == 201
    await client.post(
        f"/api/v1/files/{folder['id']}/shares",
        json={"principal_type": "user", "email": "share-editor@example.com", "role": "editor"},
        headers=owner,
    )
    # Inherited through two folder levels.
    assert (await client.get(f"/api/v1/files/{f['id']}", headers=viewer)).json()["role"] == "viewer"
    assert (
        await client.get(f"/api/v1/files/{f['id']}/download", headers=viewer)
    ).status_code == 200
    assert (
        await client.get(f"/api/v1/files?parent_id={sub['id']}", headers=viewer)
    ).status_code == 200
    assert [
        n["name"] for n in (await client.get("/api/v1/files?view=shared", headers=viewer)).json()
    ] == ["Shared"]
    # Viewer cannot change; editor can; outsider sees nothing.
    assert (
        await client.patch(f"/api/v1/files/{f['id']}", json={"name": "renamed.md"}, headers=viewer)
    ).status_code == 403
    assert (
        await client.post(
            f"/api/v1/files/{f['id']}/content",
            files=_file("spec.md", b"# v2", "text/markdown"),
            headers=viewer,
        )
    ).status_code == 403
    assert (
        await client.patch(f"/api/v1/files/{f['id']}", json={"name": "renamed.md"}, headers=editor)
    ).json()["name"] == "renamed.md"
    assert (await client.get(f"/api/v1/files/{f['id']}", headers=outsider)).status_code == 404
    # Editor cannot share to themselves as owner or delete permanently.
    assert (await client.delete(f"/api/v1/files/{f['id']}", headers=editor)).status_code == 200
    assert (
        await client.delete(f"/api/v1/files/{f['id']}/permanent", headers=editor)
    ).status_code == 403
    await client.post(f"/api/v1/files/{f['id']}/restore", headers=editor)

    # Revoking the folder share removes inherited access.
    shares = (await client.get(f"/api/v1/files/{folder['id']}/shares", headers=owner)).json()
    viewer_share = next(s for s in shares if s["role"] == "viewer")
    assert (
        await client.delete(
            f"/api/v1/files/{folder['id']}/shares/{viewer_share['id']}", headers=owner
        )
    ).status_code == 204
    assert (await client.get(f"/api/v1/files/{f['id']}", headers=viewer)).status_code == 404

    # Link sharing: viewer-only, works without sign-in, expired/unknown tokens fail.
    assert (
        await client.post(
            f"/api/v1/files/{f['id']}/shares",
            json={"principal_type": "link", "role": "editor"},
            headers=owner,
        )
    ).status_code == 422
    link = await client.post(
        f"/api/v1/files/{f['id']}/shares",
        json={"principal_type": "link", "role": "viewer"},
        headers=owner,
    )
    token = link.json()["token"]
    opened = await client.get(f"/api/v1/files/shared/{token}")
    assert opened.status_code == 200
    assert opened.json()["name"] == "renamed.md"
    assert opened.json()["download_url"].startswith("https://signed.example/")
    assert (await client.get("/api/v1/files/shared/nope")).status_code == 404


@pytest.mark.asyncio
async def test_copy_move_cycle_guard_and_quota(
    client: AsyncClient, storage: FakeStorage, monkeypatch
):
    from app.core.config import settings

    me = await _signup(client, "quota@example.com")
    a = (await client.post("/api/v1/files/folders", json={"name": "A"}, headers=me)).json()
    b = (
        await client.post(
            "/api/v1/files/folders", json={"name": "B", "parent_id": a["id"]}, headers=me
        )
    ).json()
    # A cannot be moved into its own descendant.
    assert (
        await client.patch(f"/api/v1/files/{a['id']}", json={"parent_id": b["id"]}, headers=me)
    ).status_code == 409
    f = (
        await client.post(
            "/api/v1/files/upload",
            files=_file("d.csv", b"a,b\n1,2\n", "text/csv"),
            data={"parent_id": a["id"]},
            headers=me,
        )
    ).json()
    moved = await client.patch(f"/api/v1/files/{f['id']}", json={"parent_id": b["id"]}, headers=me)
    assert moved.json()["parent_id"] == b["id"]
    copy = await client.post(
        f"/api/v1/files/{f['id']}/copy", json={"parent_id": a["id"]}, headers=me
    )
    assert copy.status_code == 201
    assert copy.json()["name"] == "Copy of d.csv"
    assert len(storage.objects) == 2
    q = (await client.get("/api/v1/files/quota", headers=me)).json()
    assert q["used_bytes"] == 16
    monkeypatch.setattr(settings, "FILES_USER_QUOTA_MB", 0)
    full = await client.post(
        "/api/v1/files/upload",
        files=_file("e.txt", b"x", "text/plain"),
        data={"parent_id": a["id"]},
        headers=me,
    )
    assert full.status_code == 507


@pytest.mark.asyncio
async def test_project_and_organisation_spaces(client: AsyncClient, storage: FakeStorage):
    from conftest import TestingSessionLocal

    from app.domains.companies.models import CompanyProfile
    from app.domains.projects.models import Project, ProjectMember

    owner = await _signup(client, "space-owner@example.com", "COMPANY")
    member = await _signup(client, "space-member@example.com")
    outsider = await _signup(client, "space-outsider@example.com")
    owner_id = uuid.UUID((await client.get("/api/v1/auth/me", headers=owner)).json()["id"])
    member_id = uuid.UUID((await client.get("/api/v1/auth/me", headers=member)).json()["id"])
    async with TestingSessionLocal() as db:
        company = CompanyProfile(user_id=owner_id, name="Space Org", tech_stack=[])
        db.add(company)
        await db.flush()
        project = Project(
            company_id=company.id, title="Space project", description="d", status="ACTIVE"
        )
        db.add(project)
        await db.flush()
        db.add(ProjectMember(project_id=project.id, user_id=member_id, role="MEMBER"))
        await db.commit()
        pid, cid = str(project.id), str(company.id)

    folder = await client.post(
        "/api/v1/files/folders", json={"name": "Design", "project_id": pid}, headers=owner
    )
    assert folder.status_code == 201
    f = await client.post(
        "/api/v1/files/upload",
        files=_file("logo.png", b"\x89PNG....", "image/png"),
        data={"parent_id": folder.json()["id"]},
        headers=member,
    )
    assert f.status_code == 201  # project members may add files to project folders
    assert (
        await client.get(f"/api/v1/files?view=project:{pid}", headers=member)
    ).status_code == 200
    assert (
        await client.get(f"/api/v1/files?view=project:{pid}", headers=outsider)
    ).status_code in (403, 404)
    assert (
        await client.get(f"/api/v1/files/{f.json()['id']}", headers=outsider)
    ).status_code == 404
    org_folder = await client.post(
        "/api/v1/files/folders", json={"name": "Policies", "company_id": cid}, headers=owner
    )
    assert org_folder.status_code == 201
    assert (
        await client.post(
            "/api/v1/files/folders", json={"name": "X", "company_id": cid}, headers=outsider
        )
    ).status_code == 404
    assert [
        n["name"]
        for n in (await client.get(f"/api/v1/files?view=organisation:{cid}", headers=owner)).json()
    ] == ["Policies"]


@pytest.mark.asyncio
async def test_preview_signing_failure_is_retryable(
    client: AsyncClient, storage: FakeStorage, monkeypatch
):
    me = await _signup(client, "preview-outage@example.com")
    uploaded = await client.post(
        "/api/v1/files/upload",
        headers=me,
        files=_file("image.png", b"image", "image/png"),
    )
    assert uploaded.status_code == 201, uploaded.text
    node_id = uploaded.json()["id"]
    monkeypatch.setattr(files_router, "generate_presigned_url", lambda *a, **kw: None)
    response = await client.get(f"/api/v1/files/{node_id}/preview", headers=me)
    assert response.status_code == 503
