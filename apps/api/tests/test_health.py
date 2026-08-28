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
