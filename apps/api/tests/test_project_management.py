import uuid
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_project_workspace_and_task_lifecycle(client: AsyncClient):
    registered = await client.post("/api/v1/auth/register", json={
        "email": "project-manager@example.com",
        "password": "secure-pass",
        "full_name": "Project Manager",
        "role": "COMPANY",
    })
    assert registered.status_code == 200
    token = registered.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    company = await client.post("/api/v1/companies/me", headers=headers, json={"name": "Delivery Labs"})
    assert company.status_code == 201

    created = await client.post("/api/v1/projects", headers=headers, json={
        "title": "AI Delivery Workspace",
        "description": "Build and ship an AI-assisted product.",
        "timeline": "6 weeks",
    })
    assert created.status_code == 201
    project_id = created.json()["id"]

    milestone = await client.post("/api/v1/projects/milestones", headers=headers, json={
        "project_id": project_id,
        "title": "Foundation",
    })
    assert milestone.status_code == 201

    task = await client.post("/api/v1/projects/tasks", headers=headers, json={
        "project_id": project_id,
        "title": "Set up API",
    })
    assert task.status_code == 201
    task_id = task.json()["id"]

    updated = await client.patch(f"/api/v1/projects/tasks/{task_id}", headers=headers, json={"status": "COMPLETED"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "COMPLETED"

    detail = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["tasks"][0]["title"] == "Set up API"


@pytest.mark.asyncio
async def test_project_plan_requires_approval_before_activation(client: AsyncClient):
    registered = await client.post("/api/v1/auth/register", json={
        "email": "project-approval@example.com",
        "password": "secure-pass",
        "full_name": "Project Owner",
        "role": "COMPANY",
    })
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    company = await client.post("/api/v1/companies/me", headers=headers, json={"name": "Approval Labs"})
    assert company.status_code == 201
    created = await client.post("/api/v1/projects", headers=headers, json={"title": "Approval Flow", "description": "A plan review test"})
    assert created.status_code == 201
    project_id = created.json()["id"]
    project_uuid = uuid.UUID(project_id)

    no_plan = await client.post(f"/api/v1/projects/{project_id}/approve-plan", headers=headers)
    assert no_plan.status_code == 409

    from conftest import TestingSessionLocal
    from app.domains.marketplace.models import AIReport

    async with TestingSessionLocal() as db:
        db.add(AIReport(
            project_id=project_uuid,
            report_type="PROJECT_PLAN",
            payload={
                "summary": "Ship the first release.",
                "milestones": [{"title": "Foundation", "description": "Set up the base", "position": 0}],
                "tasks": [{"title": "Create API", "description": "Implement the API", "milestone": "Foundation", "required_skills": ["Python"]}],
            },
        ))
        await db.commit()

    approved = await client.post(f"/api/v1/projects/{project_id}/approve-plan", headers=headers)
    assert approved.status_code == 200
    assert approved.json()["status"] == "ACTIVE"

    detail = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["plan"]["summary"] == "Ship the first release."
    assert detail.json()["milestones"][0]["title"] == "Foundation"


@pytest.mark.asyncio
async def test_task_dependencies_gate_completion_and_appear_in_workspace(client: AsyncClient):
    registered = await client.post("/api/v1/auth/register", json={
        "email": "dependency-owner@example.com", "password": "secure-pass", "full_name": "Dependency Owner", "role": "COMPANY",
    })
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    assert (await client.post("/api/v1/companies/me", headers=headers, json={"name": "Dependency Labs"})).status_code == 201
    project = await client.post("/api/v1/projects", headers=headers, json={"title": "Dependency Flow", "description": "Task dependency test"})
    project_id = project.json()["id"]
    first = await client.post("/api/v1/projects/tasks", headers=headers, json={"project_id": project_id, "title": "Prepare data"})
    second = await client.post("/api/v1/projects/tasks", headers=headers, json={"project_id": project_id, "title": "Train model"})
    first_id, second_id = first.json()["id"], second.json()["id"]

    dependency = await client.post(f"/api/v1/projects/tasks/{second_id}/dependencies", headers=headers, json={"depends_on_task_id": first_id})
    assert dependency.status_code == 201
    blocked = await client.patch(f"/api/v1/projects/tasks/{second_id}", headers=headers, json={"status": "COMPLETED"})
    assert blocked.status_code == 409
    assert (await client.patch(f"/api/v1/projects/tasks/{first_id}", headers=headers, json={"status": "COMPLETED"})).status_code == 200
    assert (await client.patch(f"/api/v1/projects/tasks/{second_id}", headers=headers, json={"status": "COMPLETED"})).status_code == 200

    detail = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["dependencies"][0]["depends_on_task_id"] == first_id


@pytest.mark.asyncio
async def test_ai_project_manager_reports_are_generated_and_persisted(client: AsyncClient, monkeypatch):
    async def fake_completion(self, prompt, system_prompt):
        if "delivery risks" in system_prompt:
            return {"risk_level": "MEDIUM", "reason": "One task is still pending.", "blocked_tasks": [], "recommendations": ["Complete the pending task."]}
        return {"summary": "The project is progressing with one task remaining.", "completed_tasks": ["Prepare data"], "pending_tasks": ["Train model"], "delayed_tasks": [], "recommendations": []}

    from app.agents.llm_client import LLMClient
    monkeypatch.setattr(LLMClient, "complete_structured_json", fake_completion)

    registered = await client.post("/api/v1/auth/register", json={
        "email": "ai-manager@example.com", "password": "secure-pass", "full_name": "AI Manager Owner", "role": "COMPANY",
    })
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    assert (await client.post("/api/v1/companies/me", headers=headers, json={"name": "AI Manager Labs"})).status_code == 201
    project = await client.post("/api/v1/projects", headers=headers, json={"title": "AI Manager Flow", "description": "AI reporting test"})
    project_id = project.json()["id"]
    await client.post("/api/v1/projects/tasks", headers=headers, json={"project_id": project_id, "title": "Prepare data"})

    progress = await client.post(f"/api/v1/projects/{project_id}/ai/progress-summary", headers=headers)
    risk = await client.post(f"/api/v1/projects/{project_id}/ai/risk-analysis", headers=headers)
    assert progress.status_code == 200
    assert progress.json()["report_type"] == "PROGRESS_SUMMARY"
    assert risk.status_code == 200
    assert risk.json()["payload"]["risk_level"] == "MEDIUM"

    reports = await client.get(f"/api/v1/projects/{project_id}/ai-report", headers=headers)
    assert reports.status_code == 200
    assert {report["report_type"] for report in reports.json()} == {"PROGRESS_SUMMARY", "RISK_ANALYSIS"}


@pytest.mark.asyncio
async def test_task_offer_qualification_acceptance_and_reassignment(client: AsyncClient):
    company_registration = await client.post("/api/v1/auth/register", json={
        "email": "dispatcher@example.com", "password": "secure-pass", "full_name": "Dispatcher", "role": "COMPANY",
    })
    company_headers = {"Authorization": f"Bearer {company_registration.json()['access_token']}"}
    assert (await client.post("/api/v1/companies/me", headers=company_headers, json={"name": "Dispatch Labs"})).status_code == 201
    engineer_registration = await client.post("/api/v1/auth/register", json={
        "email": "worker@example.com", "password": "secure-pass", "full_name": "Worker", "role": "ENGINEER",
    })
    engineer_headers = {"Authorization": f"Bearer {engineer_registration.json()['access_token']}"}
    profile = await client.post("/api/v1/engineers/me", headers=engineer_headers, json={"headline": "Python worker", "skills": ["Python"], "is_open_to_work": True})
    assert profile.status_code == 201
    profile_id = profile.json()["id"]

    project = await client.post("/api/v1/projects", headers=company_headers, json={"title": "Dispatch Flow", "description": "Offer lifecycle test"})
    project_id = project.json()["id"]
    task = await client.post("/api/v1/projects/tasks", headers=company_headers, json={"project_id": project_id, "title": "Build API", "required_skills": ["Python"]})
    task_id = task.json()["id"]
    offer = await client.post(f"/api/v1/projects/tasks/{task_id}/offers", headers=company_headers, json={"candidate_id": profile_id})
    assert offer.status_code == 201
    assert offer.json()["match_score"] == 100
    worker_notifications = await client.get("/api/v1/notifications", headers=engineer_headers)
    assert worker_notifications.status_code == 200
    assert worker_notifications.json()[0]["kind"] == "task_offer"

    offers = await client.get("/api/v1/projects/task-offers", headers=engineer_headers)
    assert offers.status_code == 200
    offer_id = offers.json()[0]["offer"]["id"]
    accepted = await client.patch(f"/api/v1/projects/task-offers/{offer_id}", headers=engineer_headers, json={"status": "ACCEPTED"})
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "ACCEPTED"

    detail = await client.get(f"/api/v1/projects/{project_id}", headers=engineer_headers)
    assert detail.status_code == 200
    assert detail.json()["tasks"][0]["assigned_user_id"] == engineer_registration.json()["user"]["id"]

    rejected = await client.post(f"/api/v1/projects/tasks/{task_id}/offers", headers=company_headers, json={"candidate_id": profile_id})
    assert rejected.status_code == 201
    assert rejected.json()["status"] == "OFFERED"


@pytest.mark.asyncio
async def test_work_submission_review_revision_and_ai_quality_check(client: AsyncClient, monkeypatch):
    async def fake_completion(self, prompt, system_prompt):
        return {"quality_score": 88, "feedback": "Clear implementation with useful evidence.", "strengths": ["Tested"], "issues": [], "recommendation": "APPROVE"}

    from app.agents.llm_client import LLMClient
    monkeypatch.setattr(LLMClient, "complete_structured_json", fake_completion)
    company_registration = await client.post("/api/v1/auth/register", json={"email": "reviewer@example.com", "password": "secure-pass", "full_name": "Reviewer", "role": "COMPANY"})
    company_headers = {"Authorization": f"Bearer {company_registration.json()['access_token']}"}
    assert (await client.post("/api/v1/companies/me", headers=company_headers, json={"name": "Review Labs"})).status_code == 201
    engineer_registration = await client.post("/api/v1/auth/register", json={"email": "submitter@example.com", "password": "secure-pass", "full_name": "Submitter", "role": "ENGINEER"})
    engineer_headers = {"Authorization": f"Bearer {engineer_registration.json()['access_token']}"}
    profile = await client.post("/api/v1/engineers/me", headers=engineer_headers, json={"skills": ["Python"], "is_open_to_work": True})
    project = await client.post("/api/v1/projects", headers=company_headers, json={"title": "Review Flow", "description": "Submission review test"})
    project_id = project.json()["id"]
    task = await client.post("/api/v1/projects/tasks", headers=company_headers, json={"project_id": project_id, "title": "Deliver API", "required_skills": ["Python"]})
    task_id = task.json()["id"]
    offer = await client.post(f"/api/v1/projects/tasks/{task_id}/offers", headers=company_headers, json={"candidate_id": profile.json()["id"]})
    await client.patch(f"/api/v1/projects/task-offers/{offer.json()['id']}", headers=engineer_headers, json={"status": "ACCEPTED"})

    submission = await client.post(f"/api/v1/projects/tasks/{task_id}/submissions", headers=engineer_headers, json={"summary": "First implementation", "artifact_urls": ["https://example.com/v1.zip"]})
    assert submission.status_code == 201
    company_notifications = await client.get("/api/v1/notifications", headers=company_headers)
    assert any(item["kind"] == "work_submission" for item in company_notifications.json())
    submission_id = submission.json()["id"]
    ai_review = await client.post(f"/api/v1/projects/submissions/{submission_id}/ai-review", headers=company_headers)
    assert ai_review.status_code == 200
    assert ai_review.json()["submission"]["quality_score"] == 88
    changes = await client.patch(f"/api/v1/projects/submissions/{submission_id}/review", headers=company_headers, json={"status": "CHANGES_REQUESTED", "review_note": "Add an integration test."})
    assert changes.status_code == 200
    revised = await client.post(f"/api/v1/projects/tasks/{task_id}/submissions", headers=engineer_headers, json={"summary": "Added integration coverage", "artifact_urls": ["https://example.com/v2.zip"]})
    assert revised.status_code == 201
    approved = await client.patch(f"/api/v1/projects/submissions/{revised.json()['id']}/review", headers=company_headers, json={"status": "APPROVED", "review_note": "Accepted."})
    assert approved.status_code == 200
    detail = await client.get(f"/api/v1/projects/{project_id}", headers=company_headers)
    assert detail.json()["tasks"][0]["status"] == "COMPLETED"
    assert len(detail.json()["submissions"]) == 2

    ledger = await client.post(f"/api/v1/projects/tasks/{task_id}/ledger", headers=engineer_headers, json={"duration_minutes": 90, "description": "Implemented and verified the API", "submission_id": revised.json()["id"]})
    assert ledger.status_code == 201
    ledger_id = ledger.json()["id"]
    summary = await client.get(f"/api/v1/projects/{project_id}/ledger", headers=company_headers)
    assert summary.status_code == 200
    assert summary.json()["total_minutes"] == 90
    voided = await client.patch(f"/api/v1/projects/ledger/{ledger_id}/void", headers=company_headers, json={"reason": "Duplicate effort entry"})
    assert voided.status_code == 200
    assert (await client.get(f"/api/v1/projects/{project_id}/ledger", headers=company_headers)).json()["total_minutes"] == 0

    payee_id = engineer_registration.json()["user"]["id"]
    escrow = await client.post(f"/api/v1/projects/{project_id}/payments/escrow", headers=company_headers, json={"amount": 125.50, "currency": "eur", "task_id": task_id, "payee_id": payee_id})
    assert escrow.status_code == 201
    assert escrow.json()["status"] == "ESCROWED"
    assert escrow.json()["currency"] == "EUR"
    payment_id = escrow.json()["id"]
    payments = await client.get(f"/api/v1/projects/{project_id}/payments", headers=company_headers)
    assert payments.status_code == 200
    assert len(payments.json()) == 1
    released = await client.patch(f"/api/v1/projects/payments/{payment_id}/release", headers=company_headers)
    assert released.status_code == 200
    assert released.json()["status"] == "RELEASED"
    escrow_two = await client.post(f"/api/v1/projects/{project_id}/payments/escrow", headers=company_headers, json={"amount": 50, "task_id": task_id, "payee_id": payee_id})
    refunded = await client.patch(f"/api/v1/projects/payments/{escrow_two.json()['id']}/refund", headers=company_headers)
    assert refunded.status_code == 200
    assert refunded.json()["status"] == "REFUNDED"

    completed = await client.patch(f"/api/v1/projects/{project_id}/status", headers=company_headers, json={"status": "COMPLETED"})
    assert completed.status_code == 200
    company_id = company_registration.json()["user"]["id"]
    worker_review = await client.post(f"/api/v1/projects/{project_id}/reviews", headers=engineer_headers, json={"reviewee_id": company_id, "rating": 5, "comment": "Clear scope and fair review process."})
    assert worker_review.status_code == 201
    company_review = await client.post(f"/api/v1/projects/{project_id}/reviews", headers=company_headers, json={"reviewee_id": payee_id, "rating": 4, "comment": "Delivered the agreed API."})
    assert company_review.status_code == 201
    duplicate = await client.post(f"/api/v1/projects/{project_id}/reviews", headers=company_headers, json={"reviewee_id": payee_id, "rating": 5, "comment": "Duplicate"})
    assert duplicate.status_code == 409
    reputation = await client.get(f"/api/v1/projects/reputation/{payee_id}", headers=company_headers)
    assert reputation.status_code == 200
    assert reputation.json()["trust_score"] == 80
    assert reputation.json()["completion_rate"] == 100
