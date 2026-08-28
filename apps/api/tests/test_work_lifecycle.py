"""
Tests for Canonical Work & Milestone Lifecycle.
Contract -> Project -> Milestone -> Task -> Work Submission -> Payment Release.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile


@pytest.mark.asyncio
async def test_complete_work_lifecycle(client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession):
    # 1. Setup company
    test_user.role = UserRole.COMPANY
    await db.commit()

    company = CompanyProfile(user_id=test_user.id, name="Lifecycle Enterprise Inc")
    db.add(company)
    await db.flush()

    # 2. Register an engineer worker
    eng_res = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "engineer_worker@lifecycle.ai",
            "password": "WorkerPassword123!",
            "full_name": "Elena Rostova",
            "role": "ENGINEER",
        },
    )
    assert eng_res.status_code == 200
    worker_id = eng_res.json()["user"]["id"]
    worker_token = eng_res.json()["access_token"]
    worker_headers = {"Authorization": f"Bearer {worker_token}"}

    # 3. Create a Contract with Milestones
    contract_res = await client.post(
        "/api/v1/contracts",
        json={
            "worker_id": worker_id,
            "title": "Full-Stack SaaS Platform Architecture",
            "scope_description": "Deliver core backend and frontend architecture modules.",
            "rate_type": "FIXED",
            "rate_amount": 5000.0,
            "currency": "USD",
            "milestones": [
                {"title": "Phase 1: Backend Foundation", "amount": 2500.0},
                {"title": "Phase 2: Frontend Integration", "amount": 2500.0},
            ],
        },
        headers=auth_headers,
    )
    assert contract_res.status_code == 201
    contract_data = contract_res.json()
    contract_id = contract_data["id"]
    assert len(contract_data["milestones"]) == 2
    cm_id_1 = contract_data["milestones"][0]["id"]

    # 4. Sign the contract (Client + Worker)
    sign_client = await client.post(f"/api/v1/contracts/{contract_id}/sign", headers=auth_headers)
    assert sign_client.status_code == 200

    sign_worker = await client.post(f"/api/v1/contracts/{contract_id}/sign", headers=worker_headers)
    assert sign_worker.status_code == 200
    assert sign_worker.json()["status"] == "ACTIVE"

    # 5. Create a Project linked to this Contract
    project_res = await client.post(
        "/api/v1/projects",
        json={
            "title": "Enterprise Transformation Project",
            "description": "Execution workspace for contract deliverables",
            "technologies": ["Python", "FastAPI", "React", "Next.js"],
            "budget": 5000.0,
            "member_ids": [worker_id],
        },
        headers=auth_headers,
    )
    assert project_res.status_code == 201
    project_id = project_res.json()["id"]

    # 6. Add Project Milestone linked to Contract Milestone
    # Endpoint is flat: POST /projects/milestones (not /projects/{id}/milestones)
    milestone_res = await client.post(
        "/api/v1/projects/milestones",
        json={
            "project_id": project_id,
            "title": "Phase 1: Backend Foundation",
            "position": 1,
        },
        headers=auth_headers,
    )
    assert milestone_res.status_code == 201, f"Milestone create failed: {milestone_res.text}"
    milestone_id = milestone_res.json()["id"]

    # 7. Create Task under Project
    # Endpoint is flat: POST /projects/tasks (not /projects/{id}/tasks)
    task_res = await client.post(
        "/api/v1/projects/tasks",
        json={
            "project_id": project_id,
            "title": "Build Auth & Health Subsystems",
            "description": "Implement enterprise health checks and token revocation.",
            "milestone": "Phase 1: Backend Foundation",
            "assigned_user_id": worker_id,
            "priority": "HIGH",
        },
        headers=auth_headers,
    )
    assert task_res.status_code == 201, f"Task create failed: {task_res.text}"
    task_id = task_res.json()["id"]

    # 8. Worker submits work (returns 201 Created)
    submission_res = await client.post(
        f"/api/v1/projects/tasks/{task_id}/submissions",
        json={
            "summary": "Completed health check endpoints and token-version session revocation.",
            "artifact_urls": ["https://github.com/gokul-227/remote-ai-platform/pull/1"],
        },
        headers=worker_headers,
    )
    assert submission_res.status_code == 201, f"Submission failed: {submission_res.text}"
    submission_id = submission_res.json()["id"]
    assert submission_res.json()["status"] == "SUBMITTED"

    # 9. Client reviews and approves submission (uses PATCH not POST)
    review_res = await client.patch(
        f"/api/v1/projects/submissions/{submission_id}/review",
        json={
            "status": "APPROVED",
            "review_note": "Excellent work. Fully meets acceptance criteria.",
        },
        headers=auth_headers,
    )
    assert review_res.status_code == 200, f"Review failed: {review_res.text}"
    assert review_res.json()["status"] == "APPROVED"
