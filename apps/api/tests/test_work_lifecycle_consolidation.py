"""
Automated tests for Work Lifecycle, Milestones, and ContractMilestone Consolidation.
Verifies synchronization across Project Milestones and Contract Milestones,
and validates work ledger & submission relationships.
"""

import uuid
import pytest
from httpx import AsyncClient


async def _register(client: AsyncClient, role: str) -> tuple[str, str]:
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"{role.lower()}_{uuid.uuid4().hex[:10]}@lifecycle.com",
            "password": "SecurePass123!",
            "full_name": f"Lifecycle {role.title()}",
            "role": role,
        },
    )
    assert resp.status_code == 200, f"Registration failed: {resp.text}"
    data = resp.json()
    return data["access_token"], data["user"]["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_milestone_dual_synchronization(client: AsyncClient):
    """
    Assert that Project Milestone status transitions automatically sync to linked
    ContractMilestone, and ContractMilestone updates sync back to Project Milestone.
    """
    company_token, _ = await _register(client, "COMPANY")
    engineer_token, engineer_id = await _register(client, "ENGINEER")

    # 1. Company profile & contract creation
    await client.post(
        "/api/v1/companies/me",
        json={"name": "Lifecycle Dynamics", "industry": "Software"},
        headers=_auth(company_token),
    )

    contract_resp = await client.post(
        "/api/v1/contracts",
        json={
            "worker_id": engineer_id,
            "title": "Consolidated Contract",
            "scope_description": "Full lifecycle delivery",
            "rate_type": "FIXED",
            "rate_amount": 1000.0,
            "milestones": [
                {"title": "Phase 1: Architecture", "amount": 400.0},
                {"title": "Phase 2: Execution", "amount": 600.0},
            ],
        },
        headers=_auth(company_token),
    )
    assert contract_resp.status_code == 201
    contract_data = contract_resp.json()
    contract_id = contract_data["id"]
    contract_milestone_id = contract_data["milestones"][0]["id"]

    # 2. Company creates project with link to contract
    project_resp = await client.post(
        "/api/v1/projects",
        json={
            "title": "Lifecycle Project",
            "description": "Integrated work lifecycle",
            "technologies": ["python", "fastapi"],
            "member_ids": [engineer_id],
        },
        headers=_auth(company_token),
    )
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    # 3. Create project milestone linked to contract milestone
    milestone_resp = await client.post(
        "/api/v1/projects/milestones",
        json={
            "project_id": project_id,
            "title": "Phase 1: Architecture Review",
            "contract_milestone_id": contract_milestone_id,
            "position": 1,
            "amount": 400.0,
        },
        headers=_auth(company_token),
    )
    assert milestone_resp.status_code == 201
    milestone_id = milestone_resp.json()["id"]

    # 4. Update project milestone status to DONE -> should sync ContractMilestone to APPROVED
    patch_resp = await client.patch(
        f"/api/v1/projects/milestones/{milestone_id}/status",
        json={"status": "DONE"},
        headers=_auth(company_token),
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "DONE"

    # Verify contract milestone updated
    get_contract = await client.get(f"/api/v1/contracts/{contract_id}", headers=_auth(company_token))
    assert get_contract.status_code == 200
    synced_cm = next(m for m in get_contract.json()["milestones"] if m["id"] == contract_milestone_id)
    assert synced_cm["status"] == "APPROVED"

    # 5. Worker delivers Phase 2 via contract milestone endpoint -> should sync project milestone
    contract_milestone_2_id = contract_data["milestones"][1]["id"]
    ms2_resp = await client.post(
        "/api/v1/projects/milestones",
        json={
            "project_id": project_id,
            "title": "Phase 2: Execution Delivery",
            "contract_milestone_id": contract_milestone_2_id,
            "position": 2,
            "amount": 600.0,
        },
        headers=_auth(company_token),
    )
    assert ms2_resp.status_code == 201
    ms2_id = ms2_resp.json()["id"]

    # Worker marks delivered on contract milestone
    deliver_resp = await client.patch(
        f"/api/v1/contracts/{contract_id}/milestones/{contract_milestone_2_id}/status",
        json={"status": "DELIVERED"},
        headers=_auth(engineer_token),
    )
    assert deliver_resp.status_code == 200
    assert deliver_resp.json()["status"] == "DELIVERED"

    # Check project milestone synced to IN_REVIEW
    ms_list = await client.get(f"/api/v1/projects/{project_id}/milestones", headers=_auth(company_token))
    assert ms_list.status_code == 200
    synced_pm2 = next(m for m in ms_list.json() if m["id"] == ms2_id)
    assert synced_pm2["status"] == "IN_REVIEW"


@pytest.mark.asyncio
async def test_work_submission_ledger_integration(client: AsyncClient):
    """Assert full work submission and ledger entry traceability."""
    company_token, _ = await _register(client, "COMPANY")
    engineer_token, engineer_id = await _register(client, "ENGINEER")

    await client.post(
        "/api/v1/companies/me",
        json={"name": "Ledger Tech", "industry": "AI"},
        headers=_auth(company_token),
    )

    project_resp = await client.post(
        "/api/v1/projects",
        json={
            "title": "Traceable Project",
            "description": "Full audit trail",
            "technologies": ["python"],
            "member_ids": [engineer_id],
        },
        headers=_auth(company_token),
    )
    project_id = project_resp.json()["id"]

    # Create task assigned to engineer
    task_resp = await client.post(
        "/api/v1/projects/tasks",
        json={
            "project_id": project_id,
            "title": "Implement Auth Middleware",
            "assigned_user_id": engineer_id,
        },
        headers=_auth(company_token),
    )
    assert task_resp.status_code == 201
    task_id = task_resp.json()["id"]

    # Engineer submits work
    sub_resp = await client.post(
        f"/api/v1/projects/tasks/{task_id}/submissions",
        json={"summary": "Completed auth middleware", "artifact_urls": ["https://github.com/pull/1"]},
        headers=_auth(engineer_token),
    )
    assert sub_resp.status_code == 201
    submission_id = sub_resp.json()["id"]

    # Engineer logs time linked to submission
    ledger_resp = await client.post(
        f"/api/v1/projects/tasks/{task_id}/ledger",
        json={
            "duration_minutes": 120,
            "description": "Refactored JWT validator & wrote unit tests",
            "submission_id": submission_id,
        },
        headers=_auth(engineer_token),
    )
    assert ledger_resp.status_code == 201
    assert ledger_resp.json()["submission_id"] == submission_id

    # Verify project ledger aggregation
    ledger_list = await client.get(f"/api/v1/projects/{project_id}/ledger", headers=_auth(company_token))
    assert ledger_list.status_code == 200
    assert ledger_list.json()["total_minutes"] == 120


@pytest.mark.asyncio
async def test_ai_submission_review_integration(client: AsyncClient):
    """
    Assert that AI submission review integrates QualityEngineAgent,
    evaluates work quality, returns structured review dimensions,
    and updates submission quality score.
    """
    company_token, _ = await _register(client, "COMPANY")
    engineer_token, engineer_id = await _register(client, "ENGINEER")

    await client.post(
        "/api/v1/companies/me",
        json={"name": "AI Quality Dynamics", "industry": "AI/ML"},
        headers=_auth(company_token),
    )

    project_resp = await client.post(
        "/api/v1/projects",
        json={
            "title": "AI Review Project",
            "description": "Project with automated quality review",
            "technologies": ["python", "fastapi"],
            "member_ids": [engineer_id],
        },
        headers=_auth(company_token),
    )
    project_id = project_resp.json()["id"]

    task_resp = await client.post(
        "/api/v1/projects/tasks",
        json={
            "project_id": project_id,
            "title": "Build Distributed Rate Limiter",
            "description": "Implement sliding window rate limiting in Redis with in-memory fallback",
            "required_skills": ["python", "redis", "fastapi"],
            "assigned_user_id": engineer_id,
        },
        headers=_auth(company_token),
    )
    task_id = task_resp.json()["id"]

    # Engineer submits comprehensive deliverable
    sub_resp = await client.post(
        f"/api/v1/projects/tasks/{task_id}/submissions",
        json={
            "summary": "Implemented sliding window rate limiter in Redis with in-memory fallback, unit tests with 95% coverage, and documentation.",
            "artifact_urls": ["https://github.com/remote-ai/pull/42", "https://docs.remote-ai.internal/ratelimit"],
        },
        headers=_auth(engineer_token),
    )
    assert sub_resp.status_code == 201
    submission_id = sub_resp.json()["id"]

    # Company requests AI review on the submission
    ai_review_resp = await client.post(
        f"/api/v1/projects/submissions/{submission_id}/ai-review",
        headers=_auth(company_token),
    )
    assert ai_review_resp.status_code == 200
    data = ai_review_resp.json()
    assert "review" in data
    assert "submission" in data

    review = data["review"]
    assert "overall_score" in review
    assert review["overall_score"] > 0
    assert "verdict" in review
    assert "grade" in review
    assert "dimensions" in review

    # Assert submission entity in DB was updated with quality score
    submission_data = data["submission"]
    assert submission_data["quality_score"] == review["overall_score"]
    assert submission_data["ai_feedback"] is not None

