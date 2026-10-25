"""Product-inspired features: endorsements (LinkedIn), sprints (Jira), message edit/delete/reactions
(Slack), commit check (GitHub), safe document preview (Office)."""

import uuid

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.network.models import Connection


async def _user(client: AsyncClient, role: str = "ENGINEER", name: str = "I User"):
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": f"in_{uuid.uuid4().hex[:8]}@test.com", "password": "Password123!", "full_name": name, "role": role},
    )
    b = res.json()
    return uuid.UUID(b["user"]["id"]), {"Authorization": f"Bearer {b['access_token']}"}


# ── LinkedIn-inspired: endorsements ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_endorsements(client: AsyncClient, db: AsyncSession):
    a, ah = await _user(client)
    b, bh = await _user(client)
    _, stranger = await _user(client)
    await client.post("/api/v1/engineers/me", headers=bh, json={"headline": "Dev", "skills": ["Python", "Go"]})
    db.add(Connection(sender_id=a, receiver_id=b, status="ACCEPTED"))
    await db.commit()

    assert (await client.post("/api/v1/endorsements", json={"user_id": str(b), "skill": "python"}, headers=ah)).status_code == 201
    assert (await client.post("/api/v1/endorsements", json={"user_id": str(b), "skill": "PYTHON"}, headers=ah)).status_code == 201
    assert (await client.post("/api/v1/endorsements", json={"user_id": str(b), "skill": "Rust"}, headers=ah)).status_code == 422
    assert (await client.post("/api/v1/endorsements", json={"user_id": str(b), "skill": "go"}, headers=stranger)).status_code == 403
    assert (await client.post("/api/v1/endorsements", json={"user_id": str(a), "skill": "go"}, headers=ah)).status_code == 422
    counts = (await client.get(f"/api/v1/endorsements/{b}", headers=ah)).json()
    assert counts[0] == {"skill": "python", "count": 1, "endorsed_by_me": True}
    await client.delete(f"/api/v1/endorsements/{b}/Python", headers=ah)
    assert (await client.get(f"/api/v1/endorsements/{b}", headers=ah)).json()[0]["count"] == 0


# ── Jira-inspired: sprints ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sprint_lifecycle(client: AsyncClient):
    _, co = await _user(client, "COMPANY")
    _, other = await _user(client, "COMPANY")
    await client.post("/api/v1/companies/me", headers=co, json={"name": f"S {uuid.uuid4().hex[:5]}"})
    await client.post("/api/v1/companies/me", headers=other, json={"name": f"O {uuid.uuid4().hex[:5]}"})
    pid = (await client.post("/api/v1/projects", headers=co, json={"title": "P", "description": "D"})).json()["id"]
    other_pid = (await client.post("/api/v1/projects", headers=other, json={"title": "Q", "description": "D"})).json()["id"]
    s1 = (await client.post(f"/api/v1/projects/{pid}/sprints", headers=co, json={"name": "Sprint 1"})).json()
    s2 = (await client.post(f"/api/v1/projects/{pid}/sprints", headers=co, json={"name": "Sprint 2"})).json()
    foreign = (await client.post(f"/api/v1/projects/{other_pid}/sprints", headers=other, json={"name": "X"})).json()
    assert (await client.get(f"/api/v1/projects/{pid}/sprints", headers=other)).status_code == 403

    t1 = (await client.post("/api/v1/projects/tasks", headers=co, json={"project_id": pid, "title": "Done"})).json()
    t2 = (await client.post("/api/v1/projects/tasks", headers=co, json={"project_id": pid, "title": "Open"})).json()
    for t in (t1, t2):
        assert (await client.patch(f"/api/v1/projects/tasks/{t['id']}", headers=co, json={"sprint_id": s1["id"]})).status_code == 200
    assert (await client.patch(f"/api/v1/projects/tasks/{t1['id']}", headers=co, json={"sprint_id": foreign["id"]})).status_code == 422

    assert (await client.post(f"/api/v1/projects/sprints/{s1['id']}/start", headers=co)).json()["status"] == "ACTIVE"
    assert (await client.post(f"/api/v1/projects/sprints/{s2['id']}/start", headers=co)).status_code == 409
    await client.patch(f"/api/v1/projects/tasks/{t1['id']}", headers=co, json={"status": "COMPLETED"})
    done = (await client.post(f"/api/v1/projects/sprints/{s1['id']}/complete", headers=co)).json()
    assert done["returned_to_backlog"] == 1
    backlog = (await client.get(f"/api/v1/projects/{pid}/tasks", params={"sprint": "backlog"}, headers=co)).json()
    assert [t["title"] for t in backlog] == ["Open"]
    assert (await client.patch(f"/api/v1/projects/tasks/{t2['id']}", headers=co, json={"sprint_id": s1["id"]})).status_code == 409


# ── Slack-inspired: edit, delete, react ───────────────────────────────────────


@pytest.mark.asyncio
async def test_message_edit_delete_and_reactions(client: AsyncClient, db: AsyncSession):
    a, ah = await _user(client)
    b, bh = await _user(client)
    db.add(Connection(sender_id=a, receiver_id=b, status="ACCEPTED"))
    await db.commit()
    cid = (await client.post("/api/v1/channels", json={"kind": "GROUP", "name": "g", "member_ids": [str(b)]}, headers=ah)).json()["id"]
    mid = (await client.post(f"/api/v1/channels/{cid}/messages", json={"body": "helo"}, headers=bh)).json()["id"]
    base = f"/api/v1/channels/{cid}/messages/{mid}"

    assert (await client.patch(base, json={"body": "hacked"}, headers=ah)).status_code == 403
    edited = (await client.patch(base, json={"body": "hello"}, headers=bh)).json()
    assert edited["body"] == "hello"
    assert edited["edited"] is True

    assert (await client.put(f"{base}/reactions/👍", headers=ah)).json()["reactions"] == {"👍": 1}
    assert (await client.put(f"{base}/reactions/👍", headers=ah)).json()["reactions"] == {"👍": 1}
    assert (await client.put(f"{base}/reactions/💩", headers=ah)).status_code == 422
    assert (await client.put(f"{base}/reactions/🎉", headers=bh)).json()["my_reactions"] == ["🎉"]
    assert (await client.delete(f"{base}/reactions/👍", headers=ah)).json()["reactions"] == {"🎉": 1}

    # The channel owner may delete; the text is gone for everyone.
    deleted = (await client.delete(base, headers=ah)).json()
    assert deleted["deleted"] is True
    assert deleted["body"] == ""
    history = (await client.get(f"/api/v1/channels/{cid}/messages", headers=bh)).json()
    assert history[0]["deleted"] is True
    assert history[0]["body"] == ""
    assert (await client.patch(base, json={"body": "again"}, headers=bh)).status_code == 409


# ── GitHub-inspired: commit check (no network) ────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize(("code", "expected"), [(200, "VERIFIED"), (404, "NOT_FOUND"), (403, "UNVERIFIED")])
async def test_check_commit_only_calls_github(monkeypatch, code: int, expected: str):
    from app.domains.deliverables import github

    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(code)

    transport = httpx.MockTransport(handler)
    real = httpx.AsyncClient
    monkeypatch.setattr(github.httpx, "AsyncClient", lambda **kw: real(transport=transport, **kw))
    assert await github.check_commit("https://github.com/acme/api", "a" * 40) == expected
    assert seen == [f"https://api.github.com/repos/acme/api/commits/{'a' * 40}"]


# ── Office-inspired: safe preview ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_preview_is_plain_text_and_office_files_download_only(client: AsyncClient, monkeypatch):
    from test_deliverables import _active_contract, _docx

    import app.domains.deliverables.router as r

    stored: dict[str, bytes] = {}

    class FakeStorage:
        async def upload_file(self, bucket, key, data, content_type="x"):
            stored[key] = data

        async def read_file(self, bucket, key, max_bytes):
            return stored[key][:max_bytes]

    monkeypatch.setattr(r, "get_storage", lambda: FakeStorage())
    cid, mid, client_h, worker_h = await _active_contract(client)
    _, outsider = await _user(client)
    base = f"/api/v1/contracts/{cid}/deliverables"
    csv_d = (await client.post(f"{base}/document", data={"milestone_id": mid, "title": "Data"},
                               files={"file": ("data.csv", b"name,total\nA,\"=SUM(1,2)\"\n", "text/csv")}, headers=worker_h)).json()
    preview = (await client.get(f"{base}/{csv_d['id']}/preview", headers=client_h)).json()
    assert preview == {"kind": "table", "rows": [["name", "total"], ["A", "=SUM(1,2)"]], "truncated": False}
    assert (await client.get(f"{base}/{csv_d['id']}/preview", headers=outsider)).status_code == 404

    docx = (await client.post(f"{base}/document", data={"milestone_id": mid, "title": "Spec"},
                              files={"file": ("spec.docx", _docx(), "application/octet-stream")}, headers=worker_h)).json()
    assert (await client.get(f"{base}/{docx['id']}/preview", headers=client_h)).status_code == 415
