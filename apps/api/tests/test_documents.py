"""Built-in Docs/Sheets/Slides: access levels, conflict-safe saves, versions, shares, comments, links."""

import uuid

import pytest
from httpx import AsyncClient


async def _user(client: AsyncClient, role: str = "ENGINEER"):
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": f"doc_{uuid.uuid4().hex[:8]}@test.com", "password": "Password123!", "full_name": "Doc U", "role": role},
    )
    b = res.json()
    return b["user"]["id"], {"Authorization": f"Bearer {b['access_token']}"}


@pytest.mark.asyncio
async def test_create_save_conflict_versions_restore(client: AsyncClient):
    _, h = await _user(client)
    d = (await client.post("/api/v1/documents", json={"kind": "SHEET", "title": "Budget"}, headers=h)).json()
    assert d["content"] == {"cells": {}, "cols": 26, "rows": 100}
    assert d["my_role"] == "OWNER"
    saved = (await client.put(f"/api/v1/documents/{d['id']}", json={"expected_version": 1, "content": {"cells": {"A1": "5"}}}, headers=h)).json()
    assert saved["version"] == 2
    stale = await client.put(f"/api/v1/documents/{d['id']}", json={"expected_version": 1, "content": {"cells": {}}}, headers=h)
    assert stale.status_code == 409
    versions = (await client.get(f"/api/v1/documents/{d['id']}/versions", headers=h)).json()
    assert [v["version"] for v in versions] == [2, 1]
    restored = (await client.post(f"/api/v1/documents/{d['id']}/versions/1/restore", headers=h)).json()
    assert restored["content"]["cells"] == {}
    assert restored["version"] == 3


@pytest.mark.asyncio
async def test_share_roles_and_isolation(client: AsyncClient):
    _, owner = await _user(client)
    viewer_id, viewer = await _user(client)
    commenter_id, commenter = await _user(client)
    _, outsider = await _user(client)
    d = (await client.post("/api/v1/documents", json={"kind": "DOC", "title": "Spec"}, headers=owner)).json()
    url = f"/api/v1/documents/{d['id']}"
    assert (await client.get(url, headers=outsider)).status_code == 404
    await client.post(f"{url}/shares", json={"user_id": viewer_id, "role": "VIEW"}, headers=owner)
    await client.post(f"{url}/shares", json={"user_id": commenter_id, "role": "COMMENT"}, headers=owner)
    assert (await client.get(url, headers=viewer)).json()["my_role"] == "VIEW"
    assert (await client.put(url, json={"expected_version": 1, "title": "x"}, headers=viewer)).status_code == 403
    assert (await client.post(f"{url}/comments", json={"body": "nice"}, headers=viewer)).status_code == 403
    assert (await client.post(f"{url}/comments", json={"body": "fix intro", "anchor": "Intro"}, headers=commenter)).status_code == 201
    assert (await client.post(f"{url}/shares", json={"user_id": viewer_id, "role": "EDIT"}, headers=commenter)).status_code == 403
    assert len((await client.get("/api/v1/documents", headers=viewer)).json()) == 1
    await client.delete(f"{url}/shares/{viewer_id}", headers=owner)
    assert (await client.get(url, headers=viewer)).status_code == 404
    assert (await client.delete(url, headers=commenter)).status_code == 403
    assert (await client.delete(url, headers=owner)).status_code == 204
    assert (await client.get(url, headers=owner)).status_code == 404


@pytest.mark.asyncio
async def test_project_members_can_edit_and_outsiders_cannot_link(client: AsyncClient):
    _, co = await _user(client, "COMPANY")
    _, other = await _user(client, "COMPANY")
    await client.post("/api/v1/companies/me", headers=co, json={"name": f"D {uuid.uuid4().hex[:5]}"})
    pid = (await client.post("/api/v1/projects", headers=co, json={"title": "P", "description": "D"})).json()["id"]
    assert (await client.post("/api/v1/documents", json={"kind": "SLIDES", "title": "x", "project_id": pid}, headers=other)).status_code == 404
    d = (await client.post("/api/v1/documents", json={"kind": "SLIDES", "title": "Kickoff", "project_id": pid}, headers=co)).json()
    assert [x["id"] for x in (await client.get("/api/v1/documents", params={"project_id": pid}, headers=co)).json()] == [d["id"]]
    assert (await client.get("/api/v1/documents", params={"project_id": pid}, headers=other)).json() == []


@pytest.mark.asyncio
async def test_content_size_limit(client: AsyncClient):
    _, h = await _user(client)
    big = {"type": "doc", "text": "x" * 1_000_100}
    assert (await client.post("/api/v1/documents", json={"kind": "DOC", "title": "Big", "content": big}, headers=h)).status_code == 422
