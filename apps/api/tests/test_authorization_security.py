"""
Phase 2 – Automated RBAC, BOLA/IDOR, and Cross-Tenant Authorization Security Suite.

Tests are grouped into six threat-model categories:

  A. Unauthenticated access (401 enforcement)
  B. Role-based access control (RBAC / 403 enforcement)
  C. Cross-tenant Contract IDOR (User A cannot reach User B's contracts)
  D. Cross-tenant Project / Task / Submission IDOR
  E. Cross-company Application status manipulation
  F. Privilege escalation (self-assign admin role)

Every test that creates a resource first creates it through the authenticated API so
that the resource ID is legitimately stored in the DB; then it probes the same
resource ID from a *different* authenticated principal to assert 403/404.

No secrets or credentials appear in this file – all tokens are obtained via the
/api/v1/auth/register endpoint against the in-memory SQLite test DB.
"""

import uuid

import pytest
from httpx import AsyncClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _register(client: AsyncClient, role: str) -> str:
    """Register a fresh user and return a valid JWT access token."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"{role.lower()}_{uuid.uuid4().hex[:10]}@sectest.com",
            "password": "SecurePass123!",
            "full_name": f"Security Test {role.title()}",
            "role": role,
        },
    )
    assert resp.status_code == 200, f"Registration failed for {role}: {resp.text}"
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _create_company_profile(client: AsyncClient, token: str) -> dict:
    """Create a company profile and return its JSON response."""
    resp = await client.post(
        "/api/v1/companies/me",
        json={"name": f"Sec Corp {uuid.uuid4().hex[:6]}", "industry": "Technology"},
        headers=_auth(token),
    )
    assert resp.status_code in (200, 201), f"Company profile creation failed: {resp.text}"
    return resp.json()


async def _create_project(client: AsyncClient, token: str) -> dict:
    """Create a project as a company user and return its JSON."""
    resp = await client.post(
        "/api/v1/projects",
        json={
            "title": f"Sec Project {uuid.uuid4().hex[:6]}",
            "description": "Security test project",
            "technologies": ["python"],
        },
        headers=_auth(token),
    )
    assert resp.status_code in (200, 201), f"Project creation failed: {resp.text}"
    return resp.json()


async def _create_task(client: AsyncClient, token: str, project_id: str) -> dict:
    """Create a project task and return its JSON."""
    resp = await client.post(
        "/api/v1/projects/tasks",
        json={
            "project_id": project_id,
            "title": f"Security Task {uuid.uuid4().hex[:6]}",
            "description": "IDOR test task",
        },
        headers=_auth(token),
    )
    assert resp.status_code in (200, 201), f"Task creation failed: {resp.text}"
    return resp.json()


# ===========================================================================
# A. UNAUTHENTICATED ACCESS
# ===========================================================================


@pytest.mark.asyncio
async def test_unauth_returns_401_on_me(client: AsyncClient):
    """GET /auth/me without a token must return 401."""
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_unauth_returns_401_on_projects(client: AsyncClient):
    resp = await client.get("/api/v1/projects")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_unauth_returns_401_on_contracts(client: AsyncClient):
    resp = await client.get("/api/v1/contracts/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_unauth_returns_401_on_payments(client: AsyncClient):
    resp = await client.get("/api/v1/payments/wallet")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_unauth_returns_401_on_notifications(client: AsyncClient):
    resp = await client.get("/api/v1/notifications")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_unauth_returns_401_on_quality_evaluate(client: AsyncClient):
    resp = await client.post("/api/v1/quality/evaluate", json={})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_unauth_returns_401_on_admin_dashboard(client: AsyncClient):
    resp = await client.get("/api/v1/admin/dashboard")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_unauth_returns_401_on_admin_users(client: AsyncClient):
    resp = await client.get("/api/v1/admin/users")
    assert resp.status_code == 401


# ===========================================================================
# B. ROLE-BASED ACCESS CONTROL (RBAC)
# ===========================================================================

ADMIN_READONLY_ROUTES = [
    "/api/v1/admin/dashboard",
    "/api/v1/admin/stats",
    "/api/v1/admin/users",
    "/api/v1/admin/sync-logs",
    "/api/v1/admin/activity-logs",
    "/api/v1/admin/ai-usage",
    "/api/v1/admin/health/details",
]


@pytest.mark.asyncio
async def test_engineer_forbidden_from_all_admin_routes(client: AsyncClient):
    """ENGINEER role must receive 403 on every admin-only endpoint."""
    token = await _register(client, "ENGINEER")
    for path in ADMIN_READONLY_ROUTES:
        resp = await client.get(path, headers=_auth(token))
        assert resp.status_code == 403, (
            f"Expected 403 for ENGINEER on {path}, got {resp.status_code}: {resp.text}"
        )


@pytest.mark.asyncio
async def test_company_forbidden_from_all_admin_routes(client: AsyncClient):
    """COMPANY role must receive 403 on every admin-only endpoint."""
    token = await _register(client, "COMPANY")
    for path in ADMIN_READONLY_ROUTES:
        resp = await client.get(path, headers=_auth(token))
        assert resp.status_code == 403, (
            f"Expected 403 for COMPANY on {path}, got {resp.status_code}: {resp.text}"
        )


@pytest.mark.asyncio
async def test_engineer_cannot_create_project(client: AsyncClient):
    """Only COMPANY/ADMIN may create projects; ENGINEER must be rejected with 403."""
    token = await _register(client, "ENGINEER")
    resp = await client.post(
        "/api/v1/projects",
        json={"title": "Hacked Project", "description": "should fail"},
        headers=_auth(token),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_engineer_cannot_create_contract(client: AsyncClient):
    """ENGINEER role cannot create contracts (only COMPANY/ADMIN can)."""
    token = await _register(client, "ENGINEER")
    target_id = str(uuid.uuid4())
    resp = await client.post(
        "/api/v1/contracts",
        json={
            "worker_id": target_id,
            "title": "Fake Contract",
            "scope_description": "test",
            "rate_type": "FIXED",
            "rate_amount": 100.0,
        },
        headers=_auth(token),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_company_cannot_submit_task_work(client: AsyncClient):
    """COMPANY role cannot submit work on tasks; that is ENGINEER-only."""
    token = await _register(client, "COMPANY")
    fake_task_id = str(uuid.uuid4())
    resp = await client.post(
        f"/api/v1/projects/tasks/{fake_task_id}/submissions",
        json={"summary": "Fake work submission"},
        headers=_auth(token),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_engineer_cannot_review_submission(client: AsyncClient):
    """ENGINEER cannot approve or request changes on a work submission."""
    token = await _register(client, "ENGINEER")
    fake_submission_id = str(uuid.uuid4())
    resp = await client.patch(
        f"/api/v1/projects/submissions/{fake_submission_id}/review",
        json={"status": "APPROVED"},
        headers=_auth(token),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_engineer_cannot_void_ledger_entry(client: AsyncClient):
    """Only COMPANY/ADMIN may void work ledger entries."""
    token = await _register(client, "ENGINEER")
    fake_entry_id = str(uuid.uuid4())
    resp = await client.patch(
        f"/api/v1/projects/ledger/{fake_entry_id}/void",
        json={"reason": "attempt to void"},
        headers=_auth(token),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_engineer_cannot_release_payment(client: AsyncClient):
    """ENGINEER cannot release escrowed sandbox payments."""
    token = await _register(client, "ENGINEER")
    fake_payment_id = str(uuid.uuid4())
    resp = await client.patch(
        f"/api/v1/projects/payments/{fake_payment_id}/release",
        headers=_auth(token),
    )
    assert resp.status_code == 403


# ===========================================================================
# C. CROSS-TENANT CONTRACT IDOR
# ===========================================================================


@pytest.mark.asyncio
async def test_contract_not_visible_to_unrelated_engineer(client: AsyncClient):
    """
    BOLA: Engineer-B cannot read a contract between Company-A and Engineer-A.
    The endpoint must return 404 (resource hidden) not 200.
    """
    company_token = await _register(client, "COMPANY")
    engineer_a_token = await _register(client, "ENGINEER")
    engineer_b_token = await _register(client, "ENGINEER")

    me_resp = await client.get("/api/v1/auth/me", headers=_auth(engineer_a_token))
    assert me_resp.status_code == 200
    engineer_a_id = me_resp.json()["id"]

    create_resp = await client.post(
        "/api/v1/contracts",
        json={
            "worker_id": engineer_a_id,
            "title": "Private Contract",
            "scope_description": "Private work",
            "rate_type": "FIXED",
            "rate_amount": 500.0,
        },
        headers=_auth(company_token),
    )
    assert create_resp.status_code in (200, 201), f"Contract creation failed: {create_resp.text}"
    contract_id = create_resp.json()["id"]

    probe_resp = await client.get(
        f"/api/v1/contracts/{contract_id}",
        headers=_auth(engineer_b_token),
    )
    assert probe_resp.status_code == 404, (
        f"IDOR! Engineer-B read a contract they are not party to. "
        f"Status: {probe_resp.status_code}, Body: {probe_resp.text}"
    )


@pytest.mark.asyncio
async def test_contract_not_patchable_by_unrelated_company(client: AsyncClient):
    """BOLA: Company-B cannot PATCH a contract that belongs to Company-A."""
    company_a_token = await _register(client, "COMPANY")
    company_b_token = await _register(client, "COMPANY")
    engineer_token = await _register(client, "ENGINEER")

    me_resp = await client.get("/api/v1/auth/me", headers=_auth(engineer_token))
    engineer_id = me_resp.json()["id"]

    create_resp = await client.post(
        "/api/v1/contracts",
        json={
            "worker_id": engineer_id,
            "title": "Company A Contract",
            "scope_description": "Company A work",
            "rate_type": "HOURLY",
            "rate_amount": 75.0,
        },
        headers=_auth(company_a_token),
    )
    assert create_resp.status_code in (200, 201)
    contract_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"/api/v1/contracts/{contract_id}",
        json={"title": "Company B Hijacked"},
        headers=_auth(company_b_token),
    )
    assert patch_resp.status_code in (403, 404), (
        f"IDOR! Company-B could modify Company-A's contract. "
        f"Status: {patch_resp.status_code}"
    )


@pytest.mark.asyncio
async def test_contract_not_signable_by_third_party(client: AsyncClient):
    """Only client/worker parties may sign a contract. Third party must be rejected."""
    company_token = await _register(client, "COMPANY")
    engineer_a_token = await _register(client, "ENGINEER")
    intruder_token = await _register(client, "ENGINEER")

    me_resp = await client.get("/api/v1/auth/me", headers=_auth(engineer_a_token))
    engineer_a_id = me_resp.json()["id"]

    create_resp = await client.post(
        "/api/v1/contracts",
        json={
            "worker_id": engineer_a_id,
            "title": "Sign Test Contract",
            "scope_description": "test",
            "rate_type": "FIXED",
            "rate_amount": 100.0,
        },
        headers=_auth(company_token),
    )
    assert create_resp.status_code in (200, 201)
    contract_id = create_resp.json()["id"]

    sign_resp = await client.post(
        f"/api/v1/contracts/{contract_id}/sign",
        headers=_auth(intruder_token),
    )
    assert sign_resp.status_code == 404, (
        f"IDOR! Third-party could sign a contract. Status: {sign_resp.status_code}"
    )


@pytest.mark.asyncio
async def test_contract_not_terminable_by_third_party(client: AsyncClient):
    """An engineer who is not party to a contract cannot terminate it."""
    company_token = await _register(client, "COMPANY")
    engineer_a_token = await _register(client, "ENGINEER")
    engineer_b_token = await _register(client, "ENGINEER")

    me_resp = await client.get("/api/v1/auth/me", headers=_auth(engineer_a_token))
    engineer_a_id = me_resp.json()["id"]

    create_resp = await client.post(
        "/api/v1/contracts",
        json={
            "worker_id": engineer_a_id,
            "title": "Terminate Test Contract",
            "scope_description": "test",
            "rate_type": "FIXED",
            "rate_amount": 100.0,
        },
        headers=_auth(company_token),
    )
    assert create_resp.status_code in (200, 201)
    contract_id = create_resp.json()["id"]

    terminate_resp = await client.post(
        f"/api/v1/contracts/{contract_id}/terminate",
        headers=_auth(engineer_b_token),
    )
    assert terminate_resp.status_code == 404, (
        f"IDOR! Engineer-B terminated a foreign contract. Status: {terminate_resp.status_code}"
    )


@pytest.mark.asyncio
async def test_contract_milestone_not_addable_by_third_party(client: AsyncClient):
    """Non-party users cannot add milestones to a contract."""
    company_token = await _register(client, "COMPANY")
    engineer_a_token = await _register(client, "ENGINEER")
    intruder_token = await _register(client, "ENGINEER")

    me_resp = await client.get("/api/v1/auth/me", headers=_auth(engineer_a_token))
    engineer_a_id = me_resp.json()["id"]

    create_resp = await client.post(
        "/api/v1/contracts",
        json={
            "worker_id": engineer_a_id,
            "title": "Milestone IDOR Contract",
            "scope_description": "test",
            "rate_type": "FIXED",
            "rate_amount": 200.0,
        },
        headers=_auth(company_token),
    )
    assert create_resp.status_code in (200, 201)
    contract_id = create_resp.json()["id"]

    probe_resp = await client.post(
        f"/api/v1/contracts/{contract_id}/milestones",
        json={"title": "Injected Milestone", "amount": 50.0},
        headers=_auth(intruder_token),
    )
    assert probe_resp.status_code == 404, (
        f"IDOR! Third-party added a milestone to a foreign contract. "
        f"Status: {probe_resp.status_code}"
    )


# ===========================================================================
# D. CROSS-TENANT PROJECT / TASK IDOR
# ===========================================================================


@pytest.mark.asyncio
async def test_project_detail_hidden_from_non_member_engineer(client: AsyncClient):
    """BOLA: An engineer who is NOT a project member cannot fetch project details."""
    company_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_token)
    outsider_token = await _register(client, "ENGINEER")

    project = await _create_project(client, company_token)
    project_id = project["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}", headers=_auth(outsider_token))
    assert resp.status_code in (403, 404), (
        f"IDOR! Non-member engineer read project {project_id}. Status: {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_project_status_update_blocked_for_non_member(client: AsyncClient):
    """Non-member cannot change project status."""
    company_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_token)
    outsider_token = await _register(client, "ENGINEER")

    project = await _create_project(client, company_token)
    project_id = project["id"]

    resp = await client.patch(
        f"/api/v1/projects/{project_id}/status",
        json={"status": "CANCELLED"},
        headers=_auth(outsider_token),
    )
    assert resp.status_code in (403, 404), (
        f"IDOR! Non-member changed project status. Status: {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_project_milestones_hidden_from_non_member(client: AsyncClient):
    """Non-member engineer cannot list milestones of a foreign project."""
    company_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_token)
    outsider_token = await _register(client, "ENGINEER")

    project = await _create_project(client, company_token)
    project_id = project["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}/milestones", headers=_auth(outsider_token))
    assert resp.status_code in (403, 404), (
        f"IDOR! Non-member read project milestones. Status: {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_project_tasks_hidden_from_non_member(client: AsyncClient):
    """Non-member engineer cannot list tasks of a foreign project."""
    company_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_token)
    outsider_token = await _register(client, "ENGINEER")

    project = await _create_project(client, company_token)
    project_id = project["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}/tasks", headers=_auth(outsider_token))
    assert resp.status_code in (403, 404), (
        f"IDOR! Non-member read project task list. Status: {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_non_member_cannot_create_task_in_foreign_project(client: AsyncClient):
    """Non-member company cannot create tasks in another company's project."""
    company_a_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_a_token)
    company_b_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_b_token)

    project = await _create_project(client, company_a_token)
    project_id = project["id"]

    resp = await client.post(
        "/api/v1/projects/tasks",
        json={
            "project_id": project_id,
            "title": "Injected Task",
            "description": "unauthorized task creation",
        },
        headers=_auth(company_b_token),
    )
    assert resp.status_code in (403, 404), (
        f"IDOR! Company-B created task in Company-A's project. Status: {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_non_member_cannot_create_milestone_in_foreign_project(client: AsyncClient):
    """Non-member cannot create milestones in another company's project."""
    company_a_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_a_token)
    company_b_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_b_token)

    project = await _create_project(client, company_a_token)
    project_id = project["id"]

    resp = await client.post(
        "/api/v1/projects/milestones",
        json={"project_id": project_id, "title": "Rogue Milestone", "position": 0},
        headers=_auth(company_b_token),
    )
    assert resp.status_code in (403, 404), (
        f"IDOR! Company-B created milestone in Company-A's project. Status: {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_task_update_blocked_for_non_member(client: AsyncClient):
    """Non-member engineer cannot update a task's status."""
    company_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_token)
    outsider_token = await _register(client, "ENGINEER")

    project = await _create_project(client, company_token)
    task = await _create_task(client, company_token, project["id"])
    task_id = task["id"]

    resp = await client.patch(
        f"/api/v1/projects/tasks/{task_id}",
        json={"status": "COMPLETED"},
        headers=_auth(outsider_token),
    )
    assert resp.status_code in (403, 404), (
        f"IDOR! Non-member updated a foreign task. Status: {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_work_submission_blocked_for_non_assigned_engineer(client: AsyncClient):
    """An engineer who is NOT assigned to a task cannot submit work for it."""
    company_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_token)
    outsider_token = await _register(client, "ENGINEER")

    project = await _create_project(client, company_token)
    task = await _create_task(client, company_token, project["id"])
    task_id = task["id"]

    resp = await client.post(
        f"/api/v1/projects/tasks/{task_id}/submissions",
        json={"summary": "Unauthorized submission"},
        headers=_auth(outsider_token),
    )
    assert resp.status_code in (403, 404), (
        f"IDOR! Unassigned engineer submitted work on task {task_id}. "
        f"Status: {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_submission_review_blocked_for_non_project_company(client: AsyncClient):
    """Company-B cannot review work submissions on Company-A's project."""
    company_b_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_b_token)

    fake_submission_id = str(uuid.uuid4())
    resp = await client.patch(
        f"/api/v1/projects/submissions/{fake_submission_id}/review",
        json={"status": "APPROVED"},
        headers=_auth(company_b_token),
    )
    assert resp.status_code in (403, 404), (
        f"IDOR! Company-B could review submissions on Company-A's project. "
        f"Status: {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_ledger_hidden_from_non_member(client: AsyncClient):
    """Non-member cannot read the work ledger of a foreign project."""
    company_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_token)
    outsider_token = await _register(client, "ENGINEER")

    project = await _create_project(client, company_token)
    project_id = project["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}/ledger", headers=_auth(outsider_token))
    assert resp.status_code in (403, 404), (
        f"IDOR! Non-member read project ledger. Status: {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_payments_hidden_from_non_member(client: AsyncClient):
    """Non-member engineer cannot read payment transactions of a foreign project."""
    company_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_token)
    outsider_token = await _register(client, "ENGINEER")

    project = await _create_project(client, company_token)
    project_id = project["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}/payments", headers=_auth(outsider_token))
    assert resp.status_code in (403, 404), (
        f"IDOR! Non-member read project payments. Status: {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_reviews_hidden_from_non_member(client: AsyncClient):
    """Non-member engineer cannot read project reviews of a foreign project."""
    company_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_token)
    outsider_token = await _register(client, "ENGINEER")

    project = await _create_project(client, company_token)
    project_id = project["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}/reviews", headers=_auth(outsider_token))
    assert resp.status_code in (403, 404), (
        f"IDOR! Non-member read project reviews. Status: {resp.status_code}"
    )


# ===========================================================================
# E. CROSS-COMPANY APPLICATION STATUS MANIPULATION
# ===========================================================================


@pytest.mark.asyncio
async def test_company_b_cannot_change_status_of_company_a_application(client: AsyncClient):
    """Company-B cannot update the application status on a job posted by Company-A."""
    company_a_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_a_token)
    company_b_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_b_token)
    engineer_token = await _register(client, "ENGINEER")

    job_resp = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Security Test Job",
            "description": "IDOR test job posting",
            "job_type": "FULL_TIME",
            "location_type": "REMOTE",
            "skills_required": ["python"],
        },
        headers=_auth(company_a_token),
    )
    assert job_resp.status_code in (200, 201), f"Job creation failed: {job_resp.text}"
    job_id = job_resp.json()["id"]

    apply_resp = await client.post(
        f"/api/v1/applications/jobs/{job_id}",
        json={"cover_note": "IDOR test application"},
        headers=_auth(engineer_token),
    )
    assert apply_resp.status_code in (200, 201), f"Apply failed: {apply_resp.text}"
    application_id = apply_resp.json()["id"]

    update_resp = await client.patch(
        f"/api/v1/applications/{application_id}/status",
        json={"status": "REJECTED"},
        headers=_auth(company_b_token),
    )
    assert update_resp.status_code == 403, (
        f"IDOR! Company-B changed application status on Company-A's job. "
        f"Status: {update_resp.status_code}: {update_resp.text}"
    )


@pytest.mark.asyncio
async def test_engineer_cannot_change_application_status(client: AsyncClient):
    """An engineer cannot use the company status update endpoint on their own application."""
    company_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_token)
    engineer_token = await _register(client, "ENGINEER")

    job_resp = await client.post(
        "/api/v1/jobs",
        json={
            "title": "RBAC Test Job",
            "description": "RBAC test job posting",
            "job_type": "CONTRACT",
            "location_type": "REMOTE",
            "skills_required": [],
        },
        headers=_auth(company_token),
    )
    assert job_resp.status_code in (200, 201)
    job_id = job_resp.json()["id"]

    apply_resp = await client.post(
        f"/api/v1/applications/jobs/{job_id}",
        json={},
        headers=_auth(engineer_token),
    )
    assert apply_resp.status_code in (200, 201)
    application_id = apply_resp.json()["id"]

    update_resp = await client.patch(
        f"/api/v1/applications/{application_id}/status",
        json={"status": "SHORTLISTED"},
        headers=_auth(engineer_token),
    )
    assert update_resp.status_code == 403, (
        f"RBAC violation! Engineer accessed company status endpoint. "
        f"Status: {update_resp.status_code}"
    )


@pytest.mark.asyncio
async def test_engineer_cannot_withdraw_other_engineers_application(client: AsyncClient):
    """Engineer-A cannot withdraw Engineer-B's application."""
    company_token = await _register(client, "COMPANY")
    await _create_company_profile(client, company_token)
    engineer_a_token = await _register(client, "ENGINEER")
    engineer_b_token = await _register(client, "ENGINEER")

    job_resp = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Withdraw IDOR Job",
            "description": "testing withdrawal IDOR",
            "job_type": "PART_TIME",
            "location_type": "REMOTE",
            "skills_required": [],
        },
        headers=_auth(company_token),
    )
    assert job_resp.status_code in (200, 201)
    job_id = job_resp.json()["id"]

    apply_resp = await client.post(
        f"/api/v1/applications/jobs/{job_id}",
        json={},
        headers=_auth(engineer_a_token),
    )
    assert apply_resp.status_code in (200, 201)
    application_id = apply_resp.json()["id"]

    withdraw_resp = await client.patch(
        f"/api/v1/applications/{application_id}/withdraw",
        headers=_auth(engineer_b_token),
    )
    assert withdraw_resp.status_code in (403, 404), (
        f"IDOR! Engineer-B withdrew Engineer-A's application. "
        f"Status: {withdraw_resp.status_code}"
    )


# ===========================================================================
# F. PRIVILEGE ESCALATION
# ===========================================================================


@pytest.mark.asyncio
async def test_engineer_cannot_self_escalate_to_admin(client: AsyncClient):
    """An engineer must NOT be able to self-assign the ADMIN role."""
    token = await _register(client, "ENGINEER")
    resp = await client.patch("/api/v1/auth/role?role=ADMIN", headers=_auth(token))
    assert resp.status_code == 403, (
        f"Privilege escalation! Engineer escalated to ADMIN. "
        f"Status: {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
async def test_company_cannot_self_escalate_to_admin(client: AsyncClient):
    """A COMPANY user cannot self-assign the ADMIN role."""
    token = await _register(client, "COMPANY")
    resp = await client.patch("/api/v1/auth/role?role=ADMIN", headers=_auth(token))
    assert resp.status_code == 403, (
        f"Privilege escalation! Company escalated to ADMIN. Status: {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_admin_self_escalation_blocked_from_all_non_admin_roles(client: AsyncClient):
    """
    The /auth/role endpoint intentionally allows ENGINEER <-> COMPANY role switching
    as an onboarding feature. However, ADMIN must NEVER be self-assignable.
    This test verifies that the ADMIN guard fires for both ENGINEER and COMPANY callers.
    """
    engineer_token = await _register(client, "ENGINEER")
    company_token = await _register(client, "COMPANY")

    for token, label in [(engineer_token, "ENGINEER"), (company_token, "COMPANY")]:
        resp = await client.patch("/api/v1/auth/role?role=ADMIN", headers=_auth(token))
        assert resp.status_code == 403, (
            f"Privilege escalation! {label} escalated to ADMIN. "
            f"Status: {resp.status_code}: {resp.text}"
        )


@pytest.mark.asyncio
async def test_random_uuid_contract_returns_404_not_500(client: AsyncClient):
    """
    A legitimate user probing a random contract UUID must receive 404, not 500.
    Ensures no information leakage or server error on guessing attacks.
    """
    token = await _register(client, "ENGINEER")
    resp = await client.get(f"/api/v1/contracts/{uuid.uuid4()}", headers=_auth(token))
    assert resp.status_code == 404, (
        f"Unexpected response to random contract UUID probe: {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_random_uuid_project_returns_403_or_404_not_500(client: AsyncClient):
    """Probing a random project UUID must not leak data or cause a 500."""
    token = await _register(client, "ENGINEER")
    resp = await client.get(f"/api/v1/projects/{uuid.uuid4()}", headers=_auth(token))
    assert resp.status_code in (403, 404), (
        f"Unexpected response to random project UUID probe: {resp.status_code}"
    )
