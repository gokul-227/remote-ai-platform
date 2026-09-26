import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_creating_a_profile_keeps_rate_availability_and_preferences(client: AsyncClient):
    reg = await client.post("/api/v1/auth/register", json={"email": "rate-keeper@example.com", "password": "secure-pass", "full_name": "Rate Keeper", "role": "ENGINEER"})
    h = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    body = {
        "headline": "Rust robotics engineer", "skills": ["Rust"], "hourly_rate": 95, "availability": "Available now",
        "timezone": "Europe/Berlin", "remote_preference": "Remote-first", "languages": ["English", "German"], "desired_salary_min": 120000,
        "experience": [{"company": "Acme", "title": "Engineer", "start_date": "2020"}],
    }
    created = await client.post("/api/v1/engineers/me", headers=h, json=body)
    assert created.status_code == 201, created.text
    me = (await client.get("/api/v1/engineers/me", headers=h)).json()
    for key in ("hourly_rate", "availability", "timezone", "remote_preference", "languages", "desired_salary_min"):
        assert me[key] == body[key], key
    assert me["experience"][0]["company"] == "Acme"
