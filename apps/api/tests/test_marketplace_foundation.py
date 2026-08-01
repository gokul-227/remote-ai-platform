import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_freelancer_signup_login_and_profile(client: AsyncClient):
    payload = {
        "email": "freelancer@example.com",
        "password": "secure-pass",
        "full_name": "Taylor Freelancer",
        "role": "ENGINEER",
    }
    registered = await client.post("/api/v1/auth/register", json=payload)
    assert registered.status_code == 200
    token = registered.json()["access_token"]

    logged_in = await client.post("/api/v1/auth/login", json={"email": payload["email"], "password": payload["password"]})
    assert logged_in.status_code == 200

    profile = await client.post(
        "/api/v1/engineers/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"headline": "Senior Python Engineer", "skills": ["Python", "FastAPI"], "years_of_experience": 6},
    )
    assert profile.status_code == 201
    assert profile.json()["skills"] == ["Python", "FastAPI"]


@pytest.mark.asyncio
async def test_company_signup_and_profile(client: AsyncClient):
    registered = await client.post("/api/v1/auth/register", json={
        "email": "company@example.com",
        "password": "secure-pass",
        "full_name": "Example HR",
        "role": "COMPANY",
    })
    assert registered.status_code == 200
    token = registered.json()["access_token"]
    response = await client.post(
        "/api/v1/companies/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Example Labs", "country": "Germany", "hiring_status": "actively_hiring", "tech_stack": ["Python"]},
    )
    assert response.status_code == 201
    assert response.json()["name"] == "Example Labs"


@pytest.mark.asyncio
async def test_marketplace_routes_are_registered(client: AsyncClient):
    openapi = (await client.get("/openapi.json")).json()["paths"]
    assert "/api/v1/jobs/company" in openapi
    assert "/api/v1/engineers/me/ai-enhance" in openapi
    assert "/api/v1/applications/company" in openapi
