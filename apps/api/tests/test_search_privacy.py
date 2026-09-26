import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_global_search_never_leaks_resume_fields(client: AsyncClient):
    from conftest import TestingSessionLocal

    from app.domains.auth.models import User, UserRole
    from app.domains.engineers.models import EngineerProfile

    async with TestingSessionLocal() as db:
        user = User(
            email="searchable-engineer@example.com",
            full_name="Searchable Engineer",
            role=UserRole.ENGINEER,
        )
        db.add(user)
        await db.flush()
        profile = EngineerProfile(
            user_id=user.id,
            headline="Backend engineer for hire — findme-keyword",
            resume_url="https://storage.example.com/private/should-not-leak.pdf",
            parsed_resume_data={"secret": "should not be exposed via search"},
            is_public=True,
        )
        db.add(profile)
        await db.commit()

    resp = await client.get("/api/v1/search", params={"q": "findme-keyword"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_engineers"] == 1
    engineer = body["engineers"][0]
    assert "resume_url" not in engineer
    assert "parsed_resume_data" not in engineer


@pytest.mark.asyncio
async def test_global_search_works_without_authentication(client: AsyncClient):
    resp = await client.get("/api/v1/search", params={"q": "anything"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_global_search_includes_matching_companies(client, company_token):
    headers = {"Authorization": f"Bearer {company_token}"}
    created = await client.post(
        "/api/v1/companies/me",
        headers=headers,
        json={"name": "Quasar Search Labs", "industry": "Developer tools", "location": "Remote"},
    )
    assert created.status_code in (200, 201), created.text
    body = (await client.get("/api/v1/search", params={"q": "quasar"})).json()
    assert body["total_companies"] == 1
    assert body["companies"][0]["name"] == "Quasar Search Labs"
    assert (await client.get("/api/v1/search", params={"q": "zzz-no-such-co"})).json()["companies"] == []
