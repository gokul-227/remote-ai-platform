"""Inventory integration on an isolated app until main.py is wired by the coordinator."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.domains.admin.inventory_router import router
from app.domains.auth.models import UserRole
from app.main import app


@pytest.fixture
async def inventory_client():
    isolated = FastAPI()
    isolated.dependency_overrides.update(app.dependency_overrides)
    isolated.include_router(router, prefix="/api/v1")

    @isolated.get("/api/v1/admin/usage")
    def usage():
        return {}

    async with AsyncClient(
        transport=ASGITransport(app=isolated), base_url="http://testserver"
    ) as client:
        yield client


async def test_inventory_requires_auth(inventory_client):
    response = await inventory_client.get("/api/v1/admin/operations/inventory")
    assert response.status_code in (401, 403)


@pytest.mark.parametrize("role", [UserRole.ENGINEER, UserRole.COMPANY])
async def test_inventory_refuses_members(inventory_client, auth_headers, test_user, db, role):
    test_user.role = role
    await db.commit()
    response = await inventory_client.get(
        "/api/v1/admin/operations/inventory", headers=auth_headers
    )
    assert response.status_code == 403


async def test_inventory_reports_only_mounted_routes_and_no_backup_success(
    inventory_client, auth_headers, test_user, db
):
    test_user.role = UserRole.ADMIN
    await db.commit()
    response = await inventory_client.get(
        "/api/v1/admin/operations/inventory", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["basis"] == "mounted_api_routes"
    assert data["health_assessed"] is False
    assert data["services"] == [{"id": "admin", "route_count": 2, "status": "mounted"}]
    assert data["read_views"] == [
        {"name": "Usage", "path": "/api/v1/admin/usage", "screen": "usage"}
    ]
    assert data["backup"]["status"] == "no_evidence"
    assert data["backup"]["last_backup_at"] is None
    assert data["backup"]["last_restore_verified_at"] is None
    assert "Auth users and sessions" in data["backup"]["excludes"]
    assert "DATABASE_URL" not in response.text
    assert "S3_SECRET" not in response.text
    for method in ("post", "put", "patch", "delete"):
        result = await getattr(inventory_client, method)(
            "/api/v1/admin/operations/inventory", headers=auth_headers
        )
        assert result.status_code == 405
