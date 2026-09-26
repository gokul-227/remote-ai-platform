"""Engineer profile visibility and public-field projection (go-live finding M).

GET /engineers/{id} used to return any profile regardless of `is_public`,
and every public projection carried the owner's AI review and profile
score. /matching/candidates additionally serialized the full private
profile (resume URL and parsed resume) to companies.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.applications.models import JobApplication
from app.domains.auth.models import User, UserRole
from app.domains.jobs.models import JobPost

PRIVATE_FIELDS = {
    "resume_url",
    "parsed_resume_data",
    "ai_summary",
    "profile_score",
    "missing_skills",
    "matching_keywords",
    "desired_salary_min",
}


async def _register(client: AsyncClient, role: str) -> tuple[dict[str, str], str]:
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"{role.lower()}_{uuid.uuid4().hex[:10]}@visibility-example.com",
            "password": "SecurePass123!",
            "full_name": f"Visibility {role.title()}",
            "role": role,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]["id"]


async def _engineer(client: AsyncClient, *, is_public: bool) -> tuple[dict, str, str]:
    headers, user_id = await _register(client, "ENGINEER")
    resp = await client.post(
        "/api/v1/engineers/me",
        headers=headers,
        json={
            "headline": "ML Engineer",
            "skills": ["Python"],
            "hourly_rate": 90,
            "desired_salary_min": 150000,
            "is_public": is_public,
        },
    )
    assert resp.status_code == 201
    return headers, user_id, resp.json()["id"]


@pytest.mark.asyncio
async def test_public_projection_omits_private_and_ai_fields(client: AsyncClient):
    owner, _, profile_id = await _engineer(client, is_public=True)
    viewer, _ = await _register(client, "COMPANY")

    for resp in (
        await client.get(f"/api/v1/engineers/{profile_id}"),
        await client.get(f"/api/v1/engineers/{profile_id}", headers=viewer),
    ):
        assert resp.status_code == 200
        body = resp.json()
        assert PRIVATE_FIELDS.isdisjoint(body), PRIVATE_FIELDS & set(body)
        assert body["hourly_rate"] == 90

    listed = next(e for e in (await client.get("/api/v1/engineers")).json() if e["id"] == profile_id)
    assert PRIVATE_FIELDS.isdisjoint(listed)

    # The owner still sees everything about themselves.
    mine = (await client.get(f"/api/v1/engineers/{profile_id}", headers=owner)).json()
    assert mine["desired_salary_min"] == 150000
    assert "profile_score" in mine


@pytest.mark.asyncio
async def test_hidden_profile_is_not_readable_by_id(client: AsyncClient, db: AsyncSession):
    owner, _, profile_id = await _engineer(client, is_public=False)
    other_engineer, _ = await _register(client, "ENGINEER")
    company, _ = await _register(client, "COMPANY")

    assert (await client.get(f"/api/v1/engineers/{profile_id}")).status_code == 404
    assert (await client.get(f"/api/v1/engineers/{profile_id}", headers=other_engineer)).status_code == 404
    assert (await client.get(f"/api/v1/engineers/{profile_id}", headers=company)).status_code == 404
    assert (await client.get(f"/api/v1/engineers/{profile_id}", headers=owner)).status_code == 200
    assert all(e["id"] != profile_id for e in (await client.get("/api/v1/engineers")).json())

    admin, admin_id = await _register(client, "ENGINEER")
    admin_user = await db.get(User, uuid.UUID(admin_id))
    admin_user.role = UserRole.ADMIN
    await db.commit()
    assert (await client.get(f"/api/v1/engineers/{profile_id}", headers=admin)).status_code == 200


@pytest.mark.asyncio
async def test_hidden_profile_visible_to_company_the_engineer_applied_to(
    client: AsyncClient, db: AsyncSession
):
    _, engineer_user_id, profile_id = await _engineer(client, is_public=False)
    company, _ = await _register(client, "COMPANY")
    unrelated_company, _ = await _register(client, "COMPANY")
    created = await client.post("/api/v1/companies/me", headers=company, json={"name": "Applied Co"})
    assert created.status_code in (200, 201)

    job = JobPost(
        title="Role",
        slug=f"role-{uuid.uuid4().hex[:8]}",
        description="d",
        company_name="Applied Co",
        source="DIRECT",
        company_id=uuid.UUID(created.json()["id"]),
    )
    db.add(job)
    await db.flush()
    db.add(JobApplication(user_id=uuid.UUID(engineer_user_id), job_id=job.id))
    await db.commit()

    seen = await client.get(f"/api/v1/engineers/{profile_id}", headers=company)
    assert seen.status_code == 200
    assert PRIVATE_FIELDS.isdisjoint(seen.json())
    assert (await client.get(f"/api/v1/engineers/{profile_id}", headers=unrelated_company)).status_code == 404


@pytest.mark.asyncio
async def test_candidate_matches_show_only_public_profiles(
    client: AsyncClient, db: AsyncSession, monkeypatch
):
    from app.domains.matching.models import JobMatch
    from app.domains.matching.service import MatchingService

    # Keep the stored scores below as-is; recomputation is not under test.
    async def _no_recalc(self, engineer, job):
        return None

    monkeypatch.setattr(MatchingService, "calculate_match", _no_recalc)

    _, _, public_id = await _engineer(client, is_public=True)
    _, _, hidden_id = await _engineer(client, is_public=False)
    company, _ = await _register(client, "COMPANY")
    created = await client.post("/api/v1/companies/me", headers=company, json={"name": "Match Co"})
    job = JobPost(
        title="Role",
        slug=f"role-{uuid.uuid4().hex[:8]}",
        description="d",
        company_name="Match Co",
        source="DIRECT",
        company_id=uuid.UUID(created.json()["id"]),
    )
    db.add(job)
    await db.flush()
    for profile_id in (public_id, hidden_id):
        db.add(
            JobMatch(
                engineer_id=uuid.UUID(profile_id),
                job_id=job.id,
                overall_score=90,
                skill_score=90,
                experience_score=90,
                role_score=90,
                reasoning="r",
                matching_skills=[],
                missing_skills=[],
            )
        )
    await db.commit()

    resp = await client.get(f"/api/v1/matching/candidates/{job.id}", headers=company)
    assert resp.status_code == 200
    assert [m["engineer_id"] for m in resp.json()] == [public_id]
    assert PRIVATE_FIELDS.isdisjoint(resp.json()[0]["engineer"])


@pytest.mark.asyncio
async def test_candidate_search_considers_more_than_the_first_30_profiles(client: AsyncClient, db: AsyncSession):
    """Only the first 30 public profiles used to be scored (go-live finding W)."""
    import datetime as dt

    from app.domains.engineers.models import EngineerProfile

    company, _ = await _register(client, "COMPANY")
    created = await client.post("/api/v1/companies/me", headers=company, json={"name": "Pool Co"})
    job = JobPost(title="Illustrator", slug=f"illustrator-{uuid.uuid4().hex[:6]}", description="d",
                  company_name="Pool Co", source="DIRECT", company_id=uuid.UUID(created.json()["id"]),
                  skills=["Illustration", "Procreate"])
    db.add(job)
    old = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)
    for i in range(40):
        user = User(id=uuid.uuid4(), keycloak_id=str(uuid.uuid4()), email=f"pool{i}@visibility-example.com",
                    full_name=f"Pool {i}", role=UserRole.ENGINEER, is_active=True, token_version=1)
        db.add(user)
        await db.flush()
        # The one strong match is the least recently updated, i.e. outside the first 30.
        best = i == 39
        db.add(EngineerProfile(user_id=user.id, headline="x", skills=["Illustration", "Procreate"] if best else ["Excel"],
                               years_of_experience=5, is_public=True, is_open_to_work=True,
                               updated_at=old if best else dt.datetime(2026, 9, 1, tzinfo=dt.UTC)))
    await db.commit()

    resp = await client.get(f"/api/v1/matching/candidates/{job.id}", headers=company)
    assert resp.status_code == 200
    assert resp.json()[0]["engineer"]["full_name"] == "Pool 39"
