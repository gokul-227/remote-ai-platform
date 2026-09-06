"""Regression tests for two authorization gaps found in
POST /projects/milestones and PATCH /projects/milestones/{id}/status during
the auth/IDOR security audit:

1. `contract_milestone_id` was accepted with no check that it actually
   belonged to a contract for the target project -- a member of project A
   could link A's Milestone to an arbitrary ContractMilestone UUID
   belonging to a completely unrelated company's contract (project B), and
   later flip that other company's contract milestone status via
   PATCH .../status (cross-tenant IDOR).
2. Once linked, any project member -- including the assigned engineer --
   could set the milestone straight to DONE/COMPLETED, which silently
   approves the linked ContractMilestone (APPROVED). The sibling contracts
   endpoint (PATCH /contracts/{id}/milestones/{id}/status) restricts that
   approval action to the client/admin specifically; this endpoint had
   drifted from that invariant.
"""

import pytest
from httpx import AsyncClient


async def _register(client: AsyncClient, email: str, role: str) -> tuple[str, str]:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "secure-pass", "full_name": email.split("@")[0], "role": role},
    )
    body = resp.json()
    return body["access_token"], body["user"]["id"]


async def _make_project(client: AsyncClient, company_headers: dict, title: str) -> str:
    resp = await client.post(
        "/api/v1/projects", headers=company_headers, json={"title": title, "description": "d"}
    )
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_milestone_cannot_link_a_contract_milestone_from_another_companys_project(
    client: AsyncClient,
):
    # Company A + its project + a contract/contract-milestone tied to a DIFFERENT project (B).
    company_a_token, _ = await _register(client, "milestone-company-a@example.com", "COMPANY")
    company_a_headers = {"Authorization": f"Bearer {company_a_token}"}
    assert (
        await client.post("/api/v1/companies/me", headers=company_a_headers, json={"name": "Company A"})
    ).status_code == 201
    project_a_id = await _make_project(client, company_a_headers, "Project A")

    company_b_token, _ = await _register(client, "milestone-company-b@example.com", "COMPANY")
    company_b_headers = {"Authorization": f"Bearer {company_b_token}"}
    assert (
        await client.post("/api/v1/companies/me", headers=company_b_headers, json={"name": "Company B"})
    ).status_code == 201
    project_b_id = await _make_project(client, company_b_headers, "Project B")

    worker_token, worker_id = await _register(client, "milestone-worker@example.com", "ENGINEER")

    # Contract for project B, with one milestone -- belongs entirely to company B.
    contract_b = await client.post(
        "/api/v1/contracts",
        headers=company_b_headers,
        json={
            "worker_id": worker_id,
            "project_id": project_b_id,
            "title": "Contract B",
            "scope_description": "work",
            "rate_type": "FIXED",
            "rate_amount": 1000,
            "currency": "USD",
            "milestones": [{"title": "Milestone B1", "amount": 500}],
        },
    )
    assert contract_b.status_code == 201
    contract_milestone_b_id = contract_b.json()["milestones"][0]["id"]

    # Company A tries to create a milestone on ITS OWN project (A), but links
    # it to company B's contract milestone -- must be rejected.
    resp = await client.post(
        "/api/v1/projects/milestones",
        headers=company_a_headers,
        json={
            "project_id": project_a_id,
            "title": "Cross-tenant milestone",
            "contract_milestone_id": contract_milestone_b_id,
        },
    )
    assert resp.status_code == 422

    # Sanity: without the cross-tenant contract_milestone_id, the same request succeeds.
    ok = await client.post(
        "/api/v1/projects/milestones",
        headers=company_a_headers,
        json={"project_id": project_a_id, "title": "Legit milestone"},
    )
    assert ok.status_code == 201


@pytest.mark.asyncio
async def test_engineer_cannot_self_approve_a_contract_linked_milestone(client: AsyncClient):
    company_token, _ = await _register(client, "milestone-approve-company@example.com", "COMPANY")
    company_headers = {"Authorization": f"Bearer {company_token}"}
    assert (
        await client.post("/api/v1/companies/me", headers=company_headers, json={"name": "Approve Co"})
    ).status_code == 201
    project_id = await _make_project(client, company_headers, "Approve Project")

    worker_token, worker_id = await _register(client, "milestone-approve-worker@example.com", "ENGINEER")
    worker_headers = {"Authorization": f"Bearer {worker_token}"}

    contract = await client.post(
        "/api/v1/contracts",
        headers=company_headers,
        json={
            "worker_id": worker_id,
            "project_id": project_id,
            "title": "Approve Contract",
            "scope_description": "work",
            "rate_type": "FIXED",
            "rate_amount": 1000,
            "currency": "USD",
            "milestones": [{"title": "M1", "amount": 500}],
        },
    )
    assert contract.status_code == 201
    contract_milestone_id = contract.json()["milestones"][0]["id"]

    milestone = await client.post(
        "/api/v1/projects/milestones",
        headers=company_headers,
        json={
            "project_id": project_id,
            "title": "Linked milestone",
            "contract_milestone_id": contract_milestone_id,
        },
    )
    assert milestone.status_code == 201
    milestone_id = milestone.json()["id"]

    # Worker must be a project member to even reach the ownership check --
    # sign the contract as worker to become one via the normal flow isn't
    # required for project membership; add directly via task offer isn't
    # necessary either, project access for ENGINEER role is via ProjectMember
    # rows, so accept a task offer isn't required for this endpoint to be
    # reached -- but if the worker has no project access at all they'd get a
    # 403 for a different reason (not a project member), so give them a role
    # via a task-offer accept.
    task = await client.post(
        "/api/v1/projects/tasks",
        headers=company_headers,
        json={"project_id": project_id, "title": "Do the work"},
    )
    offer = await client.post(
        f"/api/v1/projects/tasks/{task.json()['id']}/offers",
        headers=company_headers,
        json={"candidate_id": worker_id},
    )
    # candidate_id must resolve via engineer profile OR raw user id fallback (see create_task_offer);
    # ensure the worker has a public, open-to-work profile so the offer can be created.
    if offer.status_code != 201:
        await client.post(
            "/api/v1/engineers/me",
            headers=worker_headers,
            json={"headline": "Worker", "skills": [], "is_open_to_work": True},
        )
        offer = await client.post(
            f"/api/v1/projects/tasks/{task.json()['id']}/offers",
            headers=company_headers,
            json={"candidate_id": worker_id},
        )
    assert offer.status_code == 201
    accept = await client.patch(
        f"/api/v1/projects/task-offers/{offer.json()['id']}",
        headers=worker_headers,
        json={"status": "ACCEPTED"},
    )
    assert accept.status_code == 200

    # The worker (now a project member) must not be able to self-approve the
    # linked milestone straight to COMPLETED/DONE.
    denied = await client.patch(
        f"/api/v1/projects/milestones/{milestone_id}/status",
        headers=worker_headers,
        json={"status": "COMPLETED"},
    )
    assert denied.status_code == 403

    # The company (client) can.
    allowed = await client.patch(
        f"/api/v1/projects/milestones/{milestone_id}/status",
        headers=company_headers,
        json={"status": "COMPLETED"},
    )
    assert allowed.status_code == 200
