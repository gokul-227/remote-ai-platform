import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.projects.models import Project


@pytest.mark.asyncio
async def test_get_trust_score(client: AsyncClient, test_user: User, auth_headers: dict[str, str]):
    # Fetch trust score for test user
    res = await client.get(f"/api/v1/trust/scores/{test_user.id}")
    assert res.status_code == 200
    data = res.json()
    assert "overall_score" in data
    assert data["overall_score"] >= 0
    assert "score_breakdown" in data
    assert "factors" in data["score_breakdown"]


@pytest.mark.asyncio
async def test_add_verification_badge_starts_self_reported(
    client: AsyncClient, test_user: User, auth_headers: dict[str, str]
):
    res = await client.post(
        "/api/v1/trust/verifications",
        json={"verification_type": "GITHUB", "verifier_notes": "Connected GitHub account"},
        headers=auth_headers,
    )
    assert res.status_code == 201
    assert res.json()["verification_type"] == "GITHUB"
    # A self-submitted credential is NOT auto-verified — no evidence has been checked yet.
    assert res.json()["status"] == "SELF_REPORTED"

    # A self-reported (unverified) badge must not count toward the trust score.
    score_res = await client.get(f"/api/v1/trust/scores/{test_user.id}")
    assert score_res.status_code == 200
    assert score_res.json()["verified_skills_count"] == 0


@pytest.mark.asyncio
async def test_non_admin_cannot_review_verification(
    client: AsyncClient, test_user: User, auth_headers: dict[str, str]
):
    create_res = await client.post(
        "/api/v1/trust/verifications",
        json={"verification_type": "IDENTITY"},
        headers=auth_headers,
    )
    verification_id = create_res.json()["id"]

    review_res = await client.patch(
        f"/api/v1/trust/verifications/{verification_id}/review",
        json={"status": "VERIFIED"},
        headers=auth_headers,
    )
    assert review_res.status_code == 403


@pytest.mark.asyncio
async def test_admin_review_verifies_badge_and_updates_score(
    client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession
):
    create_res = await client.post(
        "/api/v1/trust/verifications",
        json={"verification_type": "IDENTITY"},
        headers=auth_headers,
    )
    verification_id = create_res.json()["id"]

    test_user.role = UserRole.ADMIN
    await db.commit()

    review_res = await client.patch(
        f"/api/v1/trust/verifications/{verification_id}/review",
        json={"status": "VERIFIED", "verifier_notes": "Confirmed government ID"},
        headers=auth_headers,
    )
    assert review_res.status_code == 200
    assert review_res.json()["status"] == "VERIFIED"
    assert review_res.json()["reviewed_by_id"] == str(test_user.id)
    assert review_res.json()["verified_at"] is not None

    score_res = await client.get(f"/api/v1/trust/scores/{test_user.id}")
    assert score_res.json()["verified_skills_count"] == 1


@pytest.mark.asyncio
async def test_submit_project_review(client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession):
    # Setup company & project
    test_user.role = UserRole.COMPANY
    await db.commit()

    company = CompanyProfile(
        user_id=test_user.id,
        name="Trust Review Test Corp",
    )
    db.add(company)
    await db.flush()

    project = Project(
        company_id=company.id,
        title="Trust Test Project",
        description="Description for trust testing",
        status="ACTIVE",
    )
    db.add(project)
    await db.flush()

    # Create worker
    worker_res = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "reviewee_worker@example.com",
            "password": "Password123!",
            "full_name": "Reviewee Worker",
            "role": "ENGINEER",
        },
    )
    worker_id = worker_res.json()["user"]["id"]

    # Submit review
    review_res = await client.post(
        "/api/v1/trust/reviews",
        json={
            "project_id": str(project.id),
            "reviewee_id": worker_id,
            "rating": 5,
            "comment": "Outstanding work delivered ahead of schedule!",
        },
        headers=auth_headers,
    )
    assert review_res.status_code == 201
    assert review_res.json()["rating"] == 5

    # Check reviewee trust score
    worker_score_res = await client.get(f"/api/v1/trust/scores/{worker_id}")
    assert worker_score_res.status_code == 200
    assert worker_score_res.json()["rating_avg"] == 5.0
    assert worker_score_res.json()["review_count"] == 1
