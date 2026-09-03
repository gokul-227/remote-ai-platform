import pytest
from httpx import AsyncClient


async def _register_company(client: AsyncClient, email: str, company_name: str) -> tuple[dict, str]:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "secure-pass-123", "full_name": company_name, "role": "COMPANY"},
    )
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    profile = await client.post(
        "/api/v1/companies/me",
        json={"name": company_name, "description": "A company", "website": "https://example.com"},
        headers=headers,
    )
    return profile.json(), headers["Authorization"]


@pytest.mark.asyncio
async def test_company_cannot_post_job_under_another_companys_id(client: AsyncClient):
    victim_profile, _ = await _register_company(client, "victim-co@example.com", "Victim Co")
    _, attacker_auth = await _register_company(client, "attacker-co@example.com", "Attacker Co")

    resp = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Impersonation Attempt",
            "description": "Should be rejected",
            "company_id": victim_profile["id"],
        },
        headers={"Authorization": attacker_auth},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_company_job_post_always_attributed_to_own_company(client: AsyncClient):
    profile, auth = await _register_company(client, "own-co@example.com", "Own Co")

    resp = await client.post(
        "/api/v1/jobs",
        json={"title": "Legit Job", "description": "Posted normally"},
        headers={"Authorization": auth},
    )
    assert resp.status_code == 201
    assert resp.json()["company_id"] == profile["id"]

    # Explicitly supplying one's own company_id is also fine (idempotent, not just omission).
    resp2 = await client.post(
        "/api/v1/jobs",
        json={"title": "Legit Job 2", "description": "Posted with own id", "company_id": profile["id"]},
        headers={"Authorization": auth},
    )
    assert resp2.status_code == 201
    assert resp2.json()["company_id"] == profile["id"]
