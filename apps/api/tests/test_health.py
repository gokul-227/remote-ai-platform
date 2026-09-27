"""
Tests for Health & Operations Subsystem Endpoints.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_live(client: AsyncClient):
    response = await client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "HEALTHY"
    assert "version" in data
    assert "environment" in data
    assert "timestamp" in data


@pytest.mark.asyncio
async def test_health_ready(client: AsyncClient):
    response = await client.get("/health/ready")
    assert response.status_code in (200, 503)
    data = response.json()
    assert data["status"] in ("HEALTHY", "DEGRADED", "DOWN")
    assert "services" in data
    assert "database" in data["services"]
    assert "redis" in data["services"]


async def _member(client: AsyncClient, admin: bool):
    import uuid

    from auth_support import token_for
    from conftest import TestingSessionLocal
    from sqlalchemy import select

    from app.domains.auth.models import User, UserRole

    email = f"h-{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/api/v1/auth/register", json={"email": email, "password": "p", "full_name": "H", "role": "ENGINEER"})
    async with TestingSessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == email))
        if admin:
            user.role = UserRole.ADMIN
            await db.commit()
    return {"Authorization": f"Bearer {token_for(user)}"}


@pytest.mark.asyncio
async def test_health_dependencies_is_admin_only(client: AsyncClient):
    """Each call probes the database, Redis and storage, and names providers:
    not something anonymous callers may trigger at will."""
    assert (await client.get("/health/dependencies")).status_code == 401
    assert (await client.get("/health/dependencies", headers=await _member(client, admin=False))).status_code == 403
    response = await client.get("/health/dependencies", headers=await _member(client, admin=True))
    assert response.status_code in (200, 503)
    data = response.json()
    assert data["status"] in ("HEALTHY", "DEGRADED", "DOWN")
    assert {"database", "redis", "storage", "ai_provider"} <= set(data["services"])


@pytest.mark.asyncio
async def test_ai_health_reports_when_ai_last_worked(client: AsyncClient, monkeypatch):
    """OBS-01: "configured" is not "working"; report the last real outcomes."""
    from conftest import TestingSessionLocal

    from app.core.config import settings
    from app.services.ai.models import AIUsageLog

    monkeypatch.setattr(settings, "AI_PROVIDER", "auto")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "k")
    async with TestingSessionLocal() as db:
        db.add_all([AIUsageLog(status="SUCCESS", total_tokens=10), AIUsageLog(status="FAILED", total_tokens=0)])
        await db.commit()
    data = (await client.get("/health/dependencies", headers=await _member(client, admin=True))).json()
    details = data["services"]["ai_provider"]["details"]
    assert details["last_success_at"] and details["last_failure_at"]


@pytest.mark.asyncio
async def test_health_legacy_api_v1(client: AsyncClient):
    response = await client.get("/api/v1/health")
    assert response.status_code in (200, 503)
    data = response.json()
    assert "status" in data
    assert "version" in data
    assert "services" in data


def test_git_sha_comes_from_the_deploy_not_a_hardcoded_default(monkeypatch):
    """OBS-02: GIT_SHA defaulted to a hard-coded old commit, so Sentry releases
    were tagged with it and non-Render environments reported a fabricated SHA."""
    from app.core.config import Settings

    monkeypatch.delenv("RENDER_GIT_COMMIT", raising=False)
    monkeypatch.delenv("GIT_SHA", raising=False)
    assert Settings(_env_file=None).GIT_SHA == "unknown"

    monkeypatch.setenv("RENDER_GIT_COMMIT", "a" * 40)
    assert Settings(_env_file=None).GIT_SHA == "a" * 40

    monkeypatch.delenv("RENDER_GIT_COMMIT")
    monkeypatch.setenv("GIT_SHA", "b" * 40)
    assert Settings(_env_file=None).GIT_SHA == "b" * 40
