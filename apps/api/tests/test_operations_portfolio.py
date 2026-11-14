"""Platform operations permissions, real workload counts and audited concurrency."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from auth_support import token_for
from conftest import TestingSessionLocal
from httpx import AsyncClient

from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.contracts.models import Contract
from app.domains.documents.models import Document
from app.domains.marketplace.models import ProjectTask
from app.domains.projects.models import Project


async def fixture():
    async with TestingSessionLocal() as db:
        admin = User(email=f"ops-admin-{uuid.uuid4()}@example.com", role=UserRole.ADMIN, full_name="Operations staff")
        member = User(email=f"ops-member-{uuid.uuid4()}@example.com", role=UserRole.ENGINEER, full_name="Professional")
        db.add_all([admin, member])
        await db.flush()
        company = CompanyProfile(user_id=member.id, name="Example organisation")
        db.add(company)
        await db.flush()
        project = Project(company_id=company.id, title="Delivery alpha", description="Private scope", status="ACTIVE")
        hidden = Project(company_id=company.id, title="Removed project", description="Hidden", is_deleted=True)
        db.add_all([project, hidden])
        await db.flush()
        yesterday = datetime.now(UTC) - timedelta(days=1)
        db.add_all([
            ProjectTask(project_id=project.id, title="Overdue", deadline=yesterday, status="todo"),
            ProjectTask(project_id=project.id, title="Finished", deadline=yesterday, status="done"),
            ProjectTask(project_id=hidden.id, title="Hidden", deadline=yesterday),
            Document(owner_id=member.id, title="Private document", kind="DOC", content={"secret": "private content"}),
        ])
        await db.commit()
        return admin, member, project


def headers(user):
    return {"Authorization": f"Bearer {token_for(user)}"}


@pytest.mark.asyncio
async def test_operations_are_staff_only_and_do_not_expose_workspace_content(client: AsyncClient):
    admin, member, project = await fixture()
    for path in ["/summary", "/projects"]:
        assert (await client.get(f"/api/v1/admin/operations{path}")).status_code == 401
        assert (await client.get(f"/api/v1/admin/operations{path}", headers=headers(member))).status_code == 403
    summary = await client.get("/api/v1/admin/operations/summary", headers=headers(admin))
    assert summary.status_code == 200
    assert summary.json()["open_tasks"] == 1
    assert summary.json()["overdue_tasks"] == 1
    assert summary.json()["projects_by_status"] == {"ACTIVE": 1}
    assert summary.json()["documents_by_kind"] == {"DOC": 1}
    assert "private content" not in summary.text
    page = await client.get("/api/v1/admin/operations/projects?query=alpha&limit=1", headers=headers(admin))
    assert page.headers["x-total-count"] == "1"
    assert page.json()[0]["id"] == str(project.id)
    assert page.json()[0]["task_count"] == 2
    assert "Private scope" not in page.text
    assert (await client.get("/api/v1/admin/operations/projects?limit=101", headers=headers(admin))).status_code == 422


@pytest.mark.asyncio
async def test_project_operations_check_state_and_record_reason(client: AsyncClient):
    admin, member, project = await fixture()
    path = f"/api/v1/admin/operations/projects/{project.id}/status"
    body = {"status": "REVIEW", "expected_status": "ACTIVE", "reason": "Delivery review requested"}
    assert (await client.patch(path, json=body, headers=headers(member))).status_code == 403
    assert (await client.patch(path, json=body | {"reason": "   "}, headers=headers(admin))).status_code == 422
    assert (await client.patch(path, json=body, headers=headers(admin))).json()["status"] == "REVIEW"
    assert (await client.patch(path, json=body, headers=headers(admin))).status_code == 200
    stale = body | {"status": "COMPLETED"}
    assert (await client.patch(path, json=stale, headers=headers(admin))).status_code == 409
    audit = (await client.get("/api/v1/admin/audit-events?action_prefix=admin.project.status", headers=headers(admin))).json()
    assert len(audit) == 1
    assert "Delivery review requested" in str(audit)


@pytest.mark.asyncio
async def test_operations_cannot_cancel_a_project_with_a_signed_contract(client: AsyncClient):
    admin, member, project = await fixture()
    async with TestingSessionLocal() as db:
        db.add(Contract(project_id=project.id, client_id=member.id, worker_id=admin.id, title="Live work", scope_description="Scope", rate_amount=0, status="SIGNED"))
        await db.commit()
    response = await client.patch(f"/api/v1/admin/operations/projects/{project.id}/status", headers=headers(admin), json={"status": "CANCELLED", "expected_status": "ACTIVE", "reason": "Requested cancellation"})
    assert response.status_code == 409
    assert "linked contract" in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("signature", ["client_signed_at", "worker_signed_at"])
async def test_cancellation_respects_first_signature_until_contract_is_terminal(client: AsyncClient, signature: str):
    admin, member, project = await fixture()
    async with TestingSessionLocal() as db:
        contract = Contract(
            project_id=project.id, client_id=member.id, worker_id=admin.id,
            title="Partially signed work", scope_description="Scope", rate_amount=0,
            status="DRAFT", **{signature: datetime.now(UTC)},
        )
        db.add(contract)
        await db.commit()
        contract_id = contract.id
    path = f"/api/v1/admin/operations/projects/{project.id}/status"
    body = {"status": "CANCELLED", "expected_status": "ACTIVE", "reason": "Requested cancellation"}
    assert (await client.patch(path, headers=headers(admin), json=body)).status_code == 409
    async with TestingSessionLocal() as db:
        contract = await db.get(Contract, contract_id)
        contract.status = "TERMINATED"
        await db.commit()
    assert (await client.patch(path, headers=headers(admin), json=body)).status_code == 200


@pytest.mark.asyncio
async def test_portfolio_search_is_literal_and_pages_count_the_same_scope(client: AsyncClient):
    admin, member, project = await fixture()
    async with TestingSessionLocal() as db:
        db.add_all([
            Project(company_id=project.company_id, title="Delivery 100%_complete", description="Private", status="REVIEW"),
            Project(company_id=project.company_id, title="Delivery 100xYcomplete", description="Private", status="ACTIVE"),
        ])
        await db.commit()
    response = await client.get("/api/v1/admin/operations/projects", headers=headers(admin), params={"query": "%_", "project_status": "REVIEW", "limit": 1})
    assert response.headers["x-total-count"] == "1"
    assert [p["title"] for p in response.json()] == ["Delivery 100%_complete"]
    next_page = await client.get("/api/v1/admin/operations/projects", headers=headers(admin), params={"query": "%_", "project_status": "REVIEW", "limit": 1, "skip": 1})
    assert next_page.headers["x-total-count"] == "1"
    assert next_page.json() == []
