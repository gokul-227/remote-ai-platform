"""
Automated RBAC, BOLA/IDOR, and Cross-Tenant Authorization Security Suite.
Verifies that all protected endpoints independently enforce access control.
"""

import uuid
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_admin_endpoints_forbidden_for_engineer(client: AsyncClient, engineer_token: str):
    """Assert an engineer role cannot access any admin operational endpoints."""
    headers = {"Authorization": f"Bearer {engineer_token}"}
    
    admin_routes = [
        ("GET", "/api/v1/admin/dashboard"),
        ("GET", "/api/v1/admin/stats"),
        ("GET", "/api/v1/admin/users"),
        ("GET", "/api/v1/admin/sync-logs"),
        ("GET", "/api/v1/admin/activity-logs"),
        ("GET", "/api/v1/admin/ai-usage"),
        ("GET", "/api/v1/admin/health/details"),
    ]
    
    for method, path in admin_routes:
        if method == "GET":
            resp = await client.get(path, headers=headers)
        elif method == "POST":
            resp = await client.post(path, json={}, headers=headers)
        assert resp.status_code == 403, f"Expected 403 on {path} for engineer, got {resp.status_code}"


@pytest.mark.asyncio
async def test_admin_endpoints_forbidden_for_company(client: AsyncClient, company_token: str):
    """Assert a company role cannot access any admin operational endpoints."""
    headers = {"Authorization": f"Bearer {company_token}"}
    
    admin_routes = [
        ("GET", "/api/v1/admin/dashboard"),
        ("GET", "/api/v1/admin/stats"),
        ("GET", "/api/v1/admin/users"),
        ("GET", "/api/v1/admin/health/details"),
    ]
    
    for method, path in admin_routes:
        resp = await client.get(path, headers=headers)
        assert resp.status_code == 403, f"Expected 403 on {path} for company, got {resp.status_code}"


@pytest.mark.asyncio
async def test_self_assign_admin_role_forbidden(client: AsyncClient, engineer_token: str):
    """Assert a regular user cannot escalate their own role to ADMIN."""
    headers = {"Authorization": f"Bearer {engineer_token}"}
    resp = await client.patch("/api/v1/auth/role?role=ADMIN", headers=headers)
    assert resp.status_code == 403
    assert "admin" in resp.text.lower()


@pytest.mark.asyncio
async def test_cross_tenant_project_access_prevented(client: AsyncClient, engineer_token: str):
    """Assert an engineer without membership cannot fetch or alter non-member projects."""
    headers = {"Authorization": f"Bearer {engineer_token}"}
    fake_project_id = str(uuid.uuid4())
    
    resp = await client.get(f"/api/v1/projects/{fake_project_id}", headers=headers)
    assert resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_unauthenticated_requests_rejected(client: AsyncClient):
    """Assert unauthenticated calls to private endpoints unconditionally return 401."""
    endpoints = [
        ("GET", "/api/v1/auth/me"),
        ("GET", "/api/v1/projects"),
        ("GET", "/api/v1/contracts/me"),
        ("GET", "/api/v1/payments/wallet"),
        ("GET", "/api/v1/notifications"),
        ("POST", "/api/v1/quality/evaluate"),
    ]
    for method, path in endpoints:
        if method == "GET":
            resp = await client.get(path)
        elif method == "POST":
            resp = await client.post(path, json={})
        assert resp.status_code == 401, f"Expected 401 on {path}, got {resp.status_code}"
