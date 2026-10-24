"""Milestone deliverables: who may submit, see, review; input rules; immutability."""

import io
import uuid
import zipfile

import pytest
from httpx import AsyncClient

SHA = "a" * 40


async def _register(client: AsyncClient, role: str) -> tuple[str, dict[str, str]]:
    res = await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"{role.lower()}_{uuid.uuid4().hex[:8]}@test.com",
            "password": "Password123!",
            "full_name": f"{role.title()} User",
            "role": role,
        },
    )
    body = res.json()
    return body["user"]["id"], {"Authorization": f"Bearer {body['access_token']}"}


async def _active_contract(client: AsyncClient):
    _, client_h = await _register(client, "COMPANY")
    worker_id, worker_h = await _register(client, "ENGINEER")
    res = await client.post(
        "/api/v1/contracts",
        json={
            "worker_id": worker_id,
            "title": "Build the API",
            "scope_description": "Deliver the API.",
            "rate_type": "FIXED",
            "rate_amount": 1000.0,
            "milestones": [{"title": "API v1", "amount": 1000.0}],
        },
        headers=client_h,
    )
    assert res.status_code == 201, res.text
    contract = res.json()
    for h in (client_h, worker_h):
        assert (await client.post(f"/api/v1/contracts/{contract['id']}/sign", headers=h)).status_code == 200
    return contract["id"], contract["milestones"][0]["id"], client_h, worker_h


def _code(milestone_id: str, **extra) -> dict:
    return {
        "milestone_id": milestone_id,
        "title": "API v1 source",
        "repo_url": "https://github.com/acme/api",
        "branch": "main",
        "commit_sha": SHA,
        **extra,
    }


@pytest.mark.asyncio
async def test_code_deliverable_lifecycle(client: AsyncClient):
    cid, mid, client_h, worker_h = await _active_contract(client)
    base = f"/api/v1/contracts/{cid}/deliverables"

    res = await client.post(f"{base}/code", json=_code(mid), headers=worker_h)
    assert res.status_code == 201, res.text
    d = res.json()
    assert d["commit_sha"] == SHA
    assert d["status"] == "SUBMITTED"
    assert d["version"] == 1

    # A retried submission does not create a duplicate.
    again = await client.post(f"{base}/code", json=_code(mid), headers=worker_h)
    assert again.json()["id"] == d["id"]
    assert len((await client.get(base, headers=client_h)).json()) == 1

    # Changes requested need a reason.
    bad = await client.post(f"{base}/{d['id']}/review", json={"decision": "CHANGES_REQUESTED"}, headers=client_h)
    assert bad.status_code == 422
    sent_back = await client.post(
        f"{base}/{d['id']}/review", json={"decision": "CHANGES_REQUESTED", "note": "Add tests"}, headers=client_h
    )
    assert sent_back.json()["status"] == "CHANGES_REQUESTED"

    # A revision is a new immutable row, versioned.
    rev = await client.post(f"{base}/code", json=_code(mid, commit_sha="b" * 40, supersedes_id=d["id"]), headers=worker_h)
    assert rev.status_code == 201
    assert rev.json()["version"] == 2
    ok = await client.post(f"{base}/{rev.json()['id']}/review", json={"decision": "ACCEPTED"}, headers=client_h)
    assert ok.json()["status"] == "ACCEPTED"
    # Approving the deliverable is not a payment claim and cannot be repeated.
    twice = await client.post(f"{base}/{rev.json()['id']}/review", json={"decision": "ACCEPTED"}, headers=client_h)
    assert twice.status_code == 409


@pytest.mark.asyncio
async def test_only_parties_and_right_roles(client: AsyncClient):
    cid, mid, client_h, worker_h = await _active_contract(client)
    _, outsider_h = await _register(client, "ENGINEER")
    base = f"/api/v1/contracts/{cid}/deliverables"

    assert (await client.get(base, headers=outsider_h)).status_code == 404
    assert (await client.post(f"{base}/code", json=_code(mid), headers=outsider_h)).status_code == 404
    # The client cannot submit; the professional cannot review.
    assert (await client.post(f"{base}/code", json=_code(mid), headers=client_h)).status_code == 403
    d = (await client.post(f"{base}/code", json=_code(mid), headers=worker_h)).json()
    assert (await client.post(f"{base}/{d['id']}/review", json={"decision": "ACCEPTED"}, headers=worker_h)).status_code == 403
    assert (await client.post(f"{base}/{d['id']}/review", json={"decision": "ACCEPTED"}, headers=outsider_h)).status_code == 404


@pytest.mark.asyncio
async def test_unsigned_contract_rejects_submission(client: AsyncClient):
    _, client_h = await _register(client, "COMPANY")
    worker_id, worker_h = await _register(client, "ENGINEER")
    contract = (
        await client.post(
            "/api/v1/contracts",
            json={"worker_id": worker_id, "title": "T", "scope_description": "S", "rate_amount": 1.0,
                  "milestones": [{"title": "M", "amount": 1.0}]},
            headers=client_h,
        )
    ).json()
    res = await client.post(
        f"/api/v1/contracts/{contract['id']}/deliverables/code",
        json=_code(contract["milestones"][0]["id"]),
        headers=worker_h,
    )
    assert res.status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("commit_sha", "abc123"),
        ("repo_url", "https://evil.example/acme/api"),
        ("repo_url", "javascript:alert(1)"),
        ("branch", "../../etc"),
    ],
)
async def test_code_input_rules(client: AsyncClient, field: str, value: str):
    cid, mid, _, worker_h = await _active_contract(client)
    res = await client.post(f"/api/v1/contracts/{cid}/deliverables/code", json=_code(mid, **{field: value}), headers=worker_h)
    assert res.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("url", "ok"),
    [
        ("https://demo.example.com/app", True),
        ("javascript:alert(1)", False),
        ("file:///etc/passwd", False),
        ("http://localhost:3000", False),
        ("http://169.254.169.254/latest", False),
        ("http://10.0.0.5/", False),
        ("https://user:pw@demo.example.com", False),
    ],
)
async def test_demo_url_rules(client: AsyncClient, url: str, ok: bool):
    cid, mid, _, worker_h = await _active_contract(client)
    res = await client.post(
        f"/api/v1/contracts/{cid}/deliverables/demo",
        json={"milestone_id": mid, "title": "Staging", "demo_url": url, "environment": "staging"},
        headers=worker_h,
    )
    assert res.status_code == (201 if ok else 422)


def _docx(with_macro: bool = False) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("[Content_Types].xml", "<Types/>")
        zf.writestr("word/document.xml", "<w:document/>")
        if with_macro:
            zf.writestr("word/vbaProject.bin", b"\x00")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_document_upload_and_download(client: AsyncClient, monkeypatch):
    stored: dict[str, bytes] = {}

    class FakeStorage:
        async def upload_file(self, bucket, key, data, content_type="application/pdf"):
            stored[key] = data
            return key

    import app.domains.deliverables.router as r

    monkeypatch.setattr(r, "get_storage", lambda: FakeStorage())
    monkeypatch.setattr(r, "generate_presigned_url", lambda b, k, expires_hours: f"https://signed/{k}")
    cid, mid, client_h, worker_h = await _active_contract(client)
    _, outsider_h = await _register(client, "ENGINEER")
    base = f"/api/v1/contracts/{cid}/deliverables"

    res = await client.post(
        f"{base}/document",
        data={"milestone_id": mid, "title": "Spec"},
        files={"file": ("spec.docx", _docx(), "application/octet-stream")},
        headers=worker_h,
    )
    assert res.status_code == 201, res.text
    d = res.json()
    assert d["file_name"] == "spec.docx"
    assert d["file_mime"].endswith("wordprocessingml.document")
    assert "file_key" not in d
    assert len(stored) == 1

    link = await client.get(f"{base}/{d['id']}/download", headers=client_h)
    assert link.status_code == 200
    assert link.json()["expires_in_seconds"] == 600
    assert (await client.get(f"{base}/{d['id']}/download", headers=outsider_h)).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("name", "data"),
    [
        ("spec.docx", b"MZ\x90\x00not a zip"),
        ("spec.docx", _docx(with_macro=True)),
        ("report.pdf", b"<html>not a pdf"),
        ("tool.exe", b"MZ"),
        ("notes.txt", b"bin\x00ary"),
        ("empty.pdf", b""),
    ],
)
async def test_document_rejections(client: AsyncClient, monkeypatch, name: str, data: bytes):
    import app.domains.deliverables.router as r

    monkeypatch.setattr(r, "get_storage", lambda: (_ for _ in ()).throw(AssertionError("must not store")))
    cid, mid, _, worker_h = await _active_contract(client)
    res = await client.post(
        f"/api/v1/contracts/{cid}/deliverables/document",
        data={"milestone_id": mid, "title": "Doc"},
        files={"file": (name, data, "application/octet-stream")},
        headers=worker_h,
    )
    assert res.status_code == 422
