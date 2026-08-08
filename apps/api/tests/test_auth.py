"""
Tests for Auth domain, registration, login, and authorization.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_user_success(client: AsyncClient):
    payload = {
        "email": "engineer1@example.com",
        "password": "SecurePassword123!",
        "full_name": "Test Engineer",
        "role": "engineer",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "engineer1@example.com"
    # API role values are uppercase to match the frontend authorization contract.
    assert data["user"]["role"] == "ENGINEER"


@pytest.mark.asyncio
async def test_register_admin_forbidden(client: AsyncClient):
    payload = {
        "email": "hacker@example.com",
        "password": "SecurePassword123!",
        "full_name": "Fake Admin",
        "role": "admin",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 403
    assert "Cannot self-assign admin role" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    # Register first
    reg_payload = {
        "email": "loginuser@example.com",
        "password": "MyPassword123!",
        "full_name": "Login User",
        "role": "engineer",
    }
    await client.post("/api/v1/auth/register", json=reg_payload)

    # Login
    login_payload = {
        "email": "loginuser@example.com",
        "password": "MyPassword123!",
    }
    response = await client.post("/api/v1/auth/login", json=login_payload)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "loginuser@example.com"


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    login_payload = {
        "email": "nonexistent@example.com",
        "password": "WrongPassword",
    }
    response = await client.post("/api/v1/auth/login", json=login_payload)
    assert response.status_code == 401
