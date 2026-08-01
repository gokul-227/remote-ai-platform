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
