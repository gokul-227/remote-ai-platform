"""Organisation membership and roles: invitations, acceptance, role changes,
removal, and the hiring endpoints honouring recruiter/admin roles."""

import pytest
from httpx import AsyncClient

ORG = {
    "name": "Acme Remote",
    "industry": "Software",
    "company_size": "11-50",
    "hiring_status": "actively_hiring",
}
JOB = {
    "title": "Platform Engineer",
    "description": "Build things remotely with a small team.",
    "company_name": "Acme Remote",
    "is_remote": True,
    "job_type": "full-time",
    "skills": ["python"],
}


async def _signup(client: AsyncClient, email: str, role: str = "ENGINEER") -> dict[str, str]:
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "x", "full_name": email.split("@")[0], "role": role},
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.mark.asyncio
async def test_owner_invites_recruiter_who_can_then_hire(client: AsyncClient):
    owner = await _signup(client, "owner@acme.example.com", "COMPANY")
    recruiter = await _signup(client, "recruiter@acme.example.com")
    outsider = await _signup(client, "outsider@elsewhere.example.com")

    org = await client.post("/api/v1/companies/me", json=ORG, headers=owner)
    assert org.status_code == 201
    org_id = org.json()["id"]

    # Before membership, the recruiter has no organisation and cannot post jobs.
    assert (await client.post("/api/v1/jobs", json=JOB, headers=recruiter)).status_code == 404
    assert (
        await client.get(f"/api/v1/organisations/{org_id}/members", headers=recruiter)
    ).status_code == 404

    # Unknown email is not revealed; owner-only management.
    assert (
        await client.post(
            f"/api/v1/organisations/{org_id}/members",
            json={"email": "ghost@nowhere.example.com", "role": "recruiter"},
            headers=owner,
        )
    ).status_code == 404
    assert (
        await client.post(
            f"/api/v1/organisations/{org_id}/members",
            json={"email": "recruiter@acme.example.com", "role": "recruiter"},
            headers=outsider,
        )
    ).status_code == 404

    invite = await client.post(
        f"/api/v1/organisations/{org_id}/members",
        json={"email": "recruiter@acme.example.com", "role": "recruiter"},
        headers=owner,
    )
    assert invite.status_code == 201
    member_id = invite.json()["id"]
    assert invite.json()["status"] == "invited"

    # An invitation grants nothing until accepted.
    assert (await client.post("/api/v1/jobs", json=JOB, headers=recruiter)).status_code == 404
    mine = await client.get("/api/v1/organisations/memberships/me", headers=recruiter)
    assert [m["status"] for m in mine.json()] == ["invited"]
    # Only the invitee can accept.
    assert (
        await client.post(f"/api/v1/organisations/invitations/{member_id}/accept", headers=outsider)
    ).status_code == 404
    accepted = await client.post(
        f"/api/v1/organisations/invitations/{member_id}/accept", headers=recruiter
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "active"

    # Recruiter: sees the organisation, posts a job for it, reviews applicants; cannot manage members.
    me_org = await client.get("/api/v1/companies/me", headers=recruiter)
    assert me_org.status_code == 200
    assert me_org.json()["id"] == org_id
    job = await client.post("/api/v1/jobs", json=JOB, headers=recruiter)
    assert job.status_code == 201, job.text
    assert job.json()["company_id"] == org_id
    assert (await client.get("/api/v1/applications/company", headers=recruiter)).status_code == 200
    assert (
        await client.post(
            f"/api/v1/organisations/{org_id}/members",
            json={"email": "outsider@elsewhere.example.com", "role": "member"},
            headers=recruiter,
        )
    ).status_code == 403
    members = await client.get(f"/api/v1/organisations/{org_id}/members", headers=recruiter)
    assert members.status_code == 200
    assert {m["role"] for m in members.json()} == {"owner", "recruiter"}

    # Outsider still sees nothing; a plain member cannot hire.
    assert (
        await client.get(f"/api/v1/organisations/{org_id}/members", headers=outsider)
    ).status_code == 404
    demoted = await client.patch(
        f"/api/v1/organisations/{org_id}/members/{member_id}",
        json={"role": "member"},
        headers=owner,
    )
    assert demoted.status_code == 200
    assert (await client.post("/api/v1/jobs", json=JOB, headers=recruiter)).status_code == 404
    assert (await client.get("/api/v1/applications/company", headers=recruiter)).status_code == 404

    # Removal revokes everything.
    assert (
        await client.delete(f"/api/v1/organisations/{org_id}/members/{member_id}", headers=owner)
    ).status_code == 204
    assert (await client.get("/api/v1/companies/me", headers=recruiter)).status_code == 404
    assert (
        await client.get(f"/api/v1/organisations/{org_id}/members", headers=recruiter)
    ).status_code == 404


@pytest.mark.asyncio
async def test_member_can_leave_and_invitee_can_decline(client: AsyncClient):
    owner = await _signup(client, "owner2@acme.example.com", "COMPANY")
    person = await _signup(client, "person@acme.example.com")
    org_id = (await client.post("/api/v1/companies/me", json=ORG, headers=owner)).json()["id"]
    invite = await client.post(
        f"/api/v1/organisations/{org_id}/members",
        json={"email": "person@acme.example.com", "role": "admin"},
        headers=owner,
    )
    member_id = invite.json()["id"]
    assert (
        await client.post(f"/api/v1/organisations/invitations/{member_id}/decline", headers=person)
    ).status_code == 204
    assert (await client.get("/api/v1/organisations/memberships/me", headers=person)).json() == []
    # Re-invite, accept, then leave on their own.
    member_id = (
        await client.post(
            f"/api/v1/organisations/{org_id}/members",
            json={"email": "person@acme.example.com", "role": "admin"},
            headers=owner,
        )
    ).json()["id"]
    await client.post(f"/api/v1/organisations/invitations/{member_id}/accept", headers=person)
    # An admin may invite others but cannot invite the owner.
    assert (
        await client.post(
            f"/api/v1/organisations/{org_id}/members",
            json={"email": "owner2@acme.example.com", "role": "member"},
            headers=person,
        )
    ).status_code == 409
    assert (
        await client.delete(f"/api/v1/organisations/{org_id}/members/{member_id}", headers=person)
    ).status_code == 204
    assert (await client.get("/api/v1/companies/me", headers=person)).status_code == 404
