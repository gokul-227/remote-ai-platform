import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole


@pytest.mark.asyncio
async def test_admin_ai_usage_stats(client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession):
    test_user.role = UserRole.ADMIN
    await db.commit()

    res = await client.get("/api/v1/admin/ai-usage", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "total_calls" in data
    assert "total_tokens" in data
    assert "estimated_cost_usd" in data
    assert "model_breakdown" in data


@pytest.mark.asyncio
async def test_admin_system_health_details(client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession):
    test_user.role = UserRole.ADMIN
    await db.commit()

    res = await client.get("/api/v1/admin/health/details", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["overall_status"] in {"OPERATIONAL", "DEGRADED"}
    assert len(data["services"]) >= 4
