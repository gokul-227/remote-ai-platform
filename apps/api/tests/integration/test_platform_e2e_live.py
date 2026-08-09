"""LIVE Platform E2E test - full engineer, company, and admin journeys against the running stack."""
import asyncio
import os
import uuid

import httpx

API = os.getenv("API_URL", "http://localhost:8000")
API_V1 = f"{API}/api/v1"


async def register(client, email: str, role: str) -> dict:
    r = await client.post(
        f"{API_V1}/auth/register",
        json={"email": email, "password": "platform-e2e-pass-123",
              "full_name": email.split("@")[0].replace(".", " ").title(),
              "role": role},
    )
    assert r.status_code == 200, f"register {email}: {r.status_code} {r.text}"
    return r.json()


async def engineer_flow(client, email: str) -> None:
    eng = await register(client, email, "ENGINEER")
    h = {"Authorization": f"Bearer {eng['access_token']}"}

    r = await client.post(f"{API_V1}/engineers/me", headers=h,
                          json={"headline": "Senior Python Engineer",
                                "skills": ["Python", "FastAPI", "Docker"]})
    assert r.status_code == 201, f"engineer profile: {r.status_code} {r.text}"
    profile_id = r.json()["id"]
    print(f"  [ok] Engineer profile created {profile_id}")

    r = await client.get(f"{API_V1}/jobs", headers=h)
    assert r.status_code == 200, f"browse jobs: {r.status_code} {r.text}"
    jobs = r.json()
    assert len(jobs) >= 1, f"expected seeded jobs, got {len(jobs)}"
    job_id = jobs[0]["id"]
    print(f"  [ok] Jobs browsed ({len(jobs)} found)")

    r = await client.get(f"{API_V1}/jobs?q=engineer", headers=h)
    assert r.status_code == 200, f"search jobs: {r.status_code} {r.text}"
    print(f"  [ok] Jobs searched ({len(r.json())} results)")

    r = await client.post(f"{API_V1}/saved-jobs/{job_id}", headers=h)
    assert r.status_code in (200, 201), f"save job: {r.status_code} {r.text}"
    print("  [ok] Job saved")

    r = await client.get(f"{API_V1}/saved-jobs", headers=h)
    assert r.status_code == 200, f"saved jobs: {r.status_code} {r.text}"
    assert any(j["id"] == job_id for j in r.json()), "saved job not listed"
    print("  [ok] Saved jobs listed")

    r = await client.post(f"{API_V1}/applications/jobs/{job_id}", headers=h,
                          json={"cover_note": "I am ready to build reliable systems."})
    assert r.status_code == 201, f"apply: {r.status_code} {r.text}"
    app_id = r.json()["id"]
    print(f"  [ok] Application submitted {app_id}")

    r = await client.get(f"{API_V1}/applications/me", headers=h)
    assert r.status_code == 200, f"my applications: {r.status_code} {r.text}"
    assert any(a["application"]["id"] == app_id for a in r.json()), "application not listed"
    print("  [ok] Applications listed")

    r = await client.post(f"{API_V1}/social/posts", headers=h,
                          json={"content": "E2E engineer post - hello!",
                                "visibility": "PUBLIC"})
    assert r.status_code == 201, f"social post: {r.status_code} {r.text}"
    post_id = r.json()["id"]
    print(f"  [ok] Social post created {post_id}")

    r = await client.post(f"{API_V1}/social/posts/{post_id}/like", headers=h)
    assert r.status_code == 200 and r.json()["liked"] is True
    r = await client.post(f"{API_V1}/social/posts/{post_id}/comments", headers=h,
                          json={"content": "Nice post!"})
    assert r.status_code == 201
    print("  [ok] Post liked and commented")

    r = await client.get(f"{API_V1}/notifications", headers=h)
    assert r.status_code == 200
    print(f"  [ok] Notifications read ({len(r.json())} items)")


async def company_flow(client, email: str) -> None:
    comp = await register(client, email, "COMPANY")
    h = {"Authorization": f"Bearer {comp['access_token']}"}

    r = await client.post(f"{API_V1}/companies/me", headers=h,
                          json={"name": "E2E Labs", "website": "https://e2e.example.com"})
    assert r.status_code == 201, f"company profile: {r.status_code} {r.text}"
    company_id = r.json()["id"]
    print(f"  [ok] Company profile created {company_id}")

    r = await client.post(f"{API_V1}/jobs", headers=h,
                          json={"title": "E2E Platform Engineer",
                                "description": "Build the future of remote work.",
                                "company_name": "E2E Labs",
                                "location": "Remote",
                                "is_remote": True,
                                "job_type": "FULL_TIME",
                                "source": "DIRECT",
                                "skills": ["Python", "FastAPI"]})
    assert r.status_code == 201, f"create job: {r.status_code} {r.text} {r.json()}"
    job_id = r.json()["id"]
    print(f"  [ok] Job created {job_id}")

    r = await client.patch(f"{API_V1}/jobs/{job_id}", headers=h,
                           json={"is_active": True})
    assert r.status_code == 200, f"publish job: {r.status_code} {r.text}"
    print("  [ok] Job published")

    r = await client.get(f"{API_V1}/applications/company", headers=h)
    assert r.status_code == 200
    print(f"  [ok] Company applications viewed ({len(r.json())} applications)")


async def admin_flow(client) -> None:
    # Use the seeded admin user (registration of ADMIN role is blocked by design).
    r = await client.post(
        f"{API_V1}/auth/login",
        json={"email": "admin@workmesh.ai", "password": "admin123"},
    )
    assert r.status_code == 200, f"admin login: {r.status_code} {r.text}"
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = await client.get(f"{API_V1}/admin/users", headers=h)
    assert r.status_code == 200, f"admin users: {r.status_code} {r.text}"
    assert len(r.json()) >= 1, "expected at least one user"
    print(f"  [ok] Admin users listed ({len(r.json())} users)")

    r = await client.get(f"{API_V1}/admin/activity-logs", headers=h)
    assert r.status_code == 200, f"activity logs: {r.status_code} {r.text}"
    print(f"  [ok] Admin activity logs read ({len(r.json())} logs)")

    r = await client.get(f"{API_V1}/health", headers=h)
    assert r.status_code == 200
    print("  [ok] Health checked")


async def main() -> None:
    suffix = uuid.uuid4().hex[:8]
    async with httpx.AsyncClient(timeout=30) as client:
        print("=== ENGINEER FLOW ===")
        await engineer_flow(client, f"e2e-eng-{suffix}@example.com")
        print("=== COMPANY FLOW ===")
        await company_flow(client, f"e2e-comp-{suffix}@example.com")
        print("=== ADMIN FLOW ===")
        await admin_flow(client)

    print("\nPLATFORM E2E PASSED - engineer, company, admin flows verified")


if __name__ == "__main__":
    asyncio.run(main())