"""One kind of member account: anyone can find work, freelance and hire.

Staff (ADMIN) stays separate, and ownership still decides what a member may change:
project members are not the client, and nobody edits someone else's jobs.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.projects.models import ProjectMember


async def _member(client: AsyncClient, role: str = "ENGINEER"):
    res = await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"one_{uuid.uuid4().hex[:8]}@test.com",
            "password": "Password123!",
            "full_name": "One",
            "role": role,
        },
    )
    b = res.json()
    return uuid.UUID(b["user"]["id"]), {"Authorization": f"Bearer {b['access_token']}"}


async def _org(client: AsyncClient, h):
    res = await client.post(
        "/api/v1/companies/me", headers=h, json={"name": f"Org {uuid.uuid4().hex[:6]}"}
    )
    assert res.status_code == 201, res.text


@pytest.mark.asyncio
async def test_same_account_applies_and_hires(client: AsyncClient):
    _, a = await _member(client)  # signed up as a "professional"
    _, b = await _member(client, "COMPANY")  # signed up as an "organisation"
    # Hiring needs an organisation profile, not a special account type.
    assert (
        await client.post("/api/v1/projects", headers=a, json={"title": "P", "description": "D"})
    ).status_code == 404
    await _org(client, a)
    job = await client.post(
        "/api/v1/jobs",
        headers=a,
        json={
            "title": "Backend dev",
            "description": "Build APIs",
            "company_name": "A Org",
            "skills": ["Python"],
            "job_type": "contract",
            "is_remote": True,
        },
    )
    assert job.status_code == 201, job.text
    # The "organisation" account can apply to it, and also build a professional profile.
    assert (
        await client.post(
            "/api/v1/engineers/me", headers=b, json={"headline": "Dev", "skills": ["Python"]}
        )
    ).status_code in (200, 201)
    assert (
        await client.post(
            f"/api/v1/applications/jobs/{job.json()['id']}", headers=b, json={"cover_note": "hi"}
        )
    ).status_code == 201
    # And the poster reviews it.
    apps = await client.get("/api/v1/applications/company", headers=a)
    assert apps.status_code == 200
    assert len(apps.json()) == 1


@pytest.mark.asyncio
async def test_nobody_edits_someone_elses_job(client: AsyncClient):
    _, a = await _member(client)
    _, b = await _member(client)
    await _org(client, a)
    await _org(client, b)
    job = (
        await client.post(
            "/api/v1/jobs",
            headers=a,
            json={
                "title": "Role",
                "description": "x",
                "company_name": "A",
                "skills": [],
                "is_remote": True,
            },
        )
    ).json()
    assert (
        await client.patch(f"/api/v1/jobs/{job['id']}", headers=b, json={"title": "hijacked"})
    ).status_code == 403


@pytest.mark.asyncio
async def test_project_members_are_not_the_client(client: AsyncClient, db: AsyncSession):
    _, owner = await _member(client)
    worker_id, worker = await _member(client)
    await _org(client, owner)
    pid = (
        await client.post(
            "/api/v1/projects", headers=owner, json={"title": "P", "description": "D"}
        )
    ).json()["id"]
    db.add(ProjectMember(project_id=uuid.UUID(pid), user_id=worker_id))
    await db.commit()
    task = (
        await client.post(
            "/api/v1/projects/tasks", headers=owner, json={"project_id": pid, "title": "T"}
        )
    ).json()
    # The member can see and work on the project ...
    assert (await client.get(f"/api/v1/projects/{pid}", headers=worker)).status_code == 200
    # ... but client-only actions are refused, even though role gates no longer split accounts.
    assert (
        await client.post(f"/api/v1/projects/{pid}/approve-plan", headers=worker)
    ).status_code == 403
    offer = await client.post(
        f"/api/v1/projects/tasks/{task['id']}/offers",
        headers=worker,
        json={"candidate_id": str(worker_id)},
    )
    assert offer.status_code == 403
    # A stranger can't even see it.
    _, stranger = await _member(client)
    assert (await client.get(f"/api/v1/projects/{pid}", headers=stranger)).status_code == 403


@pytest.mark.asyncio
async def test_staff_role_still_cannot_be_self_assigned(client: AsyncClient):
    _, a = await _member(client)
    assert (await client.get("/api/v1/admin/stats", headers=a)).status_code == 403
    res = await client.patch("/api/v1/auth/role", headers=a, json={"role": "ADMIN"})
    assert res.status_code in (400, 403, 422)


@pytest.mark.asyncio
async def test_staff_accounts_can_also_use_member_features(client: AsyncClient):
    """An admin is a user of the product too: member gates let them through."""
    from auth_support import token_for
    from conftest import TestingSessionLocal

    from app.domains.auth.models import User, UserRole

    async with TestingSessionLocal() as db:
        admin = User(
            email="staff-member@example.com", full_name="Staff Member", role=UserRole.ADMIN
        )
        db.add(admin)
        await db.commit()
    headers = {"Authorization": f"Bearer {token_for(admin)}"}
    assert (await client.get("/api/v1/saved-jobs", headers=headers)).status_code == 200
    assert (await client.get("/api/v1/applications/me", headers=headers)).status_code == 200
