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


@pytest.mark.asyncio
async def test_health_dependencies(client: AsyncClient):
    response = await client.get("/health/dependencies")
    assert response.status_code in (200, 503)
    data = response.json()
    assert data["status"] in ("HEALTHY", "DEGRADED", "DOWN")
    assert "services" in data
    assert "database" in data["services"]
    assert "redis" in data["services"]
    assert "storage" in data["services"]
    assert "ai_provider" in data["services"]


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
