"""Stated job preferences: validation, summary sentence and their effect on the
recommendation pool."""

import pytest
from httpx import AsyncClient


async def _signup(client: AsyncClient, email: str, role: str = "ENGINEER") -> dict[str, str]:
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "x", "full_name": "P", "role": role},
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.mark.asyncio
async def test_preferences_round_trip_and_summary(client: AsyncClient):
    me = await _signup(client, "prefs@example.com")
    assert (await client.get("/api/v1/jobs/preferences/me", headers=me)).json() is None
    summary = await client.get("/api/v1/jobs/preferences/me/summary", headers=me)
    assert summary.json()["configured"] is False

    bad = await client.put(
        "/api/v1/jobs/preferences/me", headers=me, json={"remote_scope": "office", "titles": ["x"]}
    )
    assert bad.status_code == 422
    saved = await client.put(
        "/api/v1/jobs/preferences/me",
        headers=me,
        json={
            "titles": ["  Data Engineer ", "Platform Engineer"],
            "job_types": ["Full-Time", "contract", "bogus"],
            "remote_scope": "remote",
            "locations": ["Germany", "EU"],
            "min_salary": 70000,
            "currency": "EUR",
        },
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["titles"] == ["Data Engineer", "Platform Engineer"]
    assert body["job_types"] == ["contract", "full-time"]
    summary = (await client.get("/api/v1/jobs/preferences/me/summary", headers=me)).json()
    assert summary["configured"] is True
    assert "Data Engineer or Platform Engineer" in summary["summary"]
    assert "70,000 EUR" in summary["summary"]
    # Another user has their own, separate preferences.
    other = await _signup(client, "prefs2@example.com")
    assert (await client.get("/api/v1/jobs/preferences/me", headers=other)).json() is None


@pytest.mark.asyncio
async def test_preferences_narrow_the_recommendation_pool(client: AsyncClient):
    from conftest import TestingSessionLocal

    from app.domains.jobs.models import JobPost, JobPreference
    from app.domains.matching.service import MatchingService

    me = await _signup(client, "pool@example.com")
    prof = await client.post(
        "/api/v1/engineers/me",
        headers=me,
        json={
            "primary_role": "Data Engineer",
            "skills": ["python", "sql"],
            "years_of_experience": 5,
        },
    )
    assert prof.status_code in (200, 201), prof.text
    user_id = (await client.get("/api/v1/auth/me", headers=me)).json()["id"]
    import uuid

    async with TestingSessionLocal() as db:
        for i in range(6):
            db.add(
                JobPost(
                    title=f"Data Engineer {i}",
                    slug=f"data-engineer-{i}",
                    description="x",
                    company_name="A",
                    is_remote=True,
                    job_type="contract",
                    source="TEST",
                    skills=["python"],
                )
            )
        for i in range(6):
            db.add(
                JobPost(
                    title=f"Sales Lead {i}",
                    slug=f"sales-{i}",
                    description="x",
                    company_name="B",
                    is_remote=False,
                    job_type="full-time",
                    source="TEST",
                    skills=["crm"],
                )
            )
        db.add(
            JobPreference(
                user_id=uuid.UUID(user_id),
                titles=["Data Engineer"],
                job_types=["contract"],
                remote_scope="remote",
                locations=[],
                currency="USD",
                notify_new_matches=True,
            )
        )
        await db.commit()
    async with TestingSessionLocal() as db:
        pool = await MatchingService(db)._preference_pool(uuid.UUID(user_id))
        assert len(pool) == 6
        assert all(j.title.startswith("Data Engineer") for j in pool)
        # Too-narrow preferences fall back to the general pool.
        pref = await db.get(JobPreference, uuid.UUID(user_id))
        assert pref is not None
        pref.titles = ["Astronaut"]
        await db.commit()
        pool = await MatchingService(db)._preference_pool(uuid.UUID(user_id))
        assert len(pool) == 12
