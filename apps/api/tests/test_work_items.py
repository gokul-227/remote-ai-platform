"""Work items: types, labels, filters, versioned edits, cycle-safe dependencies, watchers, assignees."""

import uuid

import pytest
from httpx import AsyncClient


async def _company(client: AsyncClient) -> dict[str, str]:
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": f"wi_{uuid.uuid4().hex[:8]}@test.com", "password": "Password123!",
              "full_name": "Work Items Co", "role": "COMPANY"},
    )
    headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    assert (await client.post("/api/v1/companies/me", headers=headers, json={"name": "WI Co"})).status_code == 201
    return headers


async def _project(client: AsyncClient, headers: dict[str, str]) -> str:
    res = await client.post("/api/v1/projects", headers=headers, json={"title": "Board", "description": "Work items"})
    assert res.status_code in (200, 201), res.text
    return res.json()["id"]


async def _task(client: AsyncClient, headers, project_id: str, **extra) -> dict:
    res = await client.post("/api/v1/projects/tasks", headers=headers, json={"project_id": project_id, "title": "T", **extra})
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_types_labels_and_filters(client: AsyncClient):
    h = await _company(client)
    pid = await _project(client, h)
    bug = await _task(client, h, pid, title="Login crash", item_type="BUG", priority="CRITICAL", labels=["Auth", "auth", " ui "])
    assert bug["labels"] == ["auth", "ui"]
    assert bug["version"] == 1
    await _task(client, h, pid, title="Write docs", item_type="STORY", labels=["docs"])

    res = await client.get(f"/api/v1/projects/{pid}/tasks?item_type=BUG", headers=h)
    assert [t["title"] for t in res.json()] == ["Login crash"]
    assert (await client.get(f"/api/v1/projects/{pid}/tasks?label=docs", headers=h)).json()[0]["title"] == "Write docs"
    assert len((await client.get(f"/api/v1/projects/{pid}/tasks?q=crash", headers=h)).json()) == 1
    paged = await client.get(f"/api/v1/projects/{pid}/tasks?limit=1&skip=1", headers=h)
    assert paged.headers["X-Total-Count"] == "2"
    assert len(paged.json()) == 1

    bad = await client.post("/api/v1/projects/tasks", headers=h, json={"project_id": pid, "title": "x", "item_type": "SAGA"})
    assert bad.status_code == 422
    too_many = await client.post("/api/v1/projects/tasks", headers=h, json={"project_id": pid, "title": "x", "labels": [str(i) for i in range(11)]})
    assert too_many.status_code == 422


@pytest.mark.asyncio
async def test_concurrent_edit_is_refused(client: AsyncClient):
    h = await _company(client)
    pid = await _project(client, h)
    t = await _task(client, h, pid)
    first = await client.patch(f"/api/v1/projects/tasks/{t['id']}", headers=h, json={"expected_version": 1, "status": "IN_PROGRESS"})
    assert first.status_code == 200
    assert first.json()["version"] == 2
    stale = await client.patch(f"/api/v1/projects/tasks/{t['id']}", headers=h, json={"expected_version": 1, "status": "REVIEW"})
    assert stale.status_code == 409


@pytest.mark.asyncio
async def test_dependency_cycles_rejected(client: AsyncClient):
    h = await _company(client)
    pid = await _project(client, h)
    a = await _task(client, h, pid, title="A")
    b = await _task(client, h, pid, title="B")
    c = await _task(client, h, pid, title="C")
    dep = "/api/v1/projects/tasks/{}/dependencies"
    assert (await client.post(dep.format(b["id"]), headers=h, json={"depends_on_task_id": a["id"]})).status_code == 201
    assert (await client.post(dep.format(c["id"]), headers=h, json={"depends_on_task_id": b["id"]})).status_code == 201
    # A -> C would close the loop A -> C -> B -> A.
    assert (await client.post(dep.format(a["id"]), headers=h, json={"depends_on_task_id": c["id"]})).status_code == 409
    assert (await client.post(dep.format(a["id"]), headers=h, json={"depends_on_task_id": b["id"]})).status_code == 409


@pytest.mark.asyncio
async def test_assignee_must_be_member_and_outsiders_denied(client: AsyncClient):
    h = await _company(client)
    other_h = await _company(client)
    pid = await _project(client, h)
    outsider = await client.post(
        "/api/v1/auth/register",
        json={"email": f"o_{uuid.uuid4().hex[:8]}@test.com", "password": "Password123!", "full_name": "O", "role": "ENGINEER"},
    )
    outsider_id = outsider.json()["user"]["id"]
    bad = await client.post("/api/v1/projects/tasks", headers=h, json={"project_id": pid, "title": "x", "assigned_user_id": outsider_id})
    assert bad.status_code == 422
    t = await _task(client, h, pid)
    assert (await client.patch(f"/api/v1/projects/tasks/{t['id']}", headers=h, json={"assigned_user_id": outsider_id})).status_code == 422
    # Another organisation cannot enumerate or watch the work items.
    assert (await client.get(f"/api/v1/projects/{pid}/tasks", headers=other_h)).status_code == 403
    assert (await client.post(f"/api/v1/projects/tasks/{t['id']}/watch", headers=other_h)).status_code == 403


@pytest.mark.asyncio
async def test_watch_toggle(client: AsyncClient):
    h = await _company(client)
    pid = await _project(client, h)
    t = await _task(client, h, pid)
    assert (await client.post(f"/api/v1/projects/tasks/{t['id']}/watch", headers=h)).json()["watching"] is True
    assert (await client.delete(f"/api/v1/projects/tasks/{t['id']}/watch", headers=h)).json()["watching"] is False


@pytest.mark.asyncio
async def test_board_priorities_still_accepted(client: AsyncClient):
    h = await _company(client)
    pid = await _project(client, h)
    t = await _task(client, h, pid, priority="URGENT")
    res = await client.patch(f"/api/v1/projects/tasks/{t['id']}", headers=h, json={"priority": "LOW"})
    assert res.status_code == 200
