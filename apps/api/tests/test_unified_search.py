"""Unified search respects access: public groups for everyone, private groups only
for members/owners; wildcards in the query are literal."""

import uuid

import pytest
from conftest import TestingSessionLocal
from httpx import AsyncClient

from app.domains.channels.models import Channel, ChannelMember
from app.domains.companies.models import CompanyProfile
from app.domains.documents.models import Document, DocumentShare
from app.domains.projects.models import Project, ProjectMember


async def _signup(
    client: AsyncClient, email: str, role: str = "ENGINEER"
) -> tuple[dict[str, str], uuid.UUID]:
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "x", "full_name": "S", "role": role},
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}, uuid.UUID(
        res.json()["user"]["id"]
    )


@pytest.mark.asyncio
async def test_private_groups_are_scoped_to_the_caller(client: AsyncClient):
    owner_h, owner_id = await _signup(client, "s-owner@example.com", "COMPANY")
    member_h, member_id = await _signup(client, "s-member@example.com")
    outsider_h, outsider_id = await _signup(client, "s-outsider@example.com")
    async with TestingSessionLocal() as db:
        company = CompanyProfile(user_id=owner_id, name="Zephyr Labs 100%", tech_stack=[])
        db.add(company)
        await db.flush()
        project = Project(
            company_id=company.id, title="Zephyr migration", description="internal", status="ACTIVE"
        )
        db.add(project)
        await db.flush()
        db.add(ProjectMember(project_id=project.id, user_id=member_id, role="MEMBER"))
        doc = Document(
            owner_id=owner_id, project_id=None, kind="doc", title="Zephyr runbook", content={}
        )
        db.add(doc)
        await db.flush()
        db.add(DocumentShare(document_id=doc.id, user_id=member_id, role="viewer"))
        channel = Channel(
            kind="group", owner_id=owner_id, name="zephyr-team", topic="Zephyr launch"
        )
        db.add(channel)
        await db.flush()
        db.add(ChannelMember(channel_id=channel.id, user_id=owner_id))
        db.add(ChannelMember(channel_id=channel.id, user_id=member_id, active=False))
        await db.commit()

    anon = await client.get("/api/v1/search", params={"q": "zephyr"})
    assert anon.status_code == 200
    assert anon.json()["signed_in"] is False
    assert [c["name"] for c in anon.json()["companies"]] == ["Zephyr Labs 100%"]
    assert anon.json()["projects"] == []
    assert anon.json()["documents"] == []

    owner = (await client.get("/api/v1/search", params={"q": "zephyr"}, headers=owner_h)).json()
    assert [p["title"] for p in owner["projects"]] == ["Zephyr migration"]
    assert [d["title"] for d in owner["documents"]] == ["Zephyr runbook"]
    assert [c["title"] for c in owner["channels"]] == ["zephyr-team"]

    member = (await client.get("/api/v1/search", params={"q": "zephyr"}, headers=member_h)).json()
    assert [p["title"] for p in member["projects"]] == ["Zephyr migration"]  # project member
    assert [d["title"] for d in member["documents"]] == ["Zephyr runbook"]  # shared
    assert member["channels"] == []  # inactive channel member

    outsider = (
        await client.get("/api/v1/search", params={"q": "zephyr"}, headers=outsider_h)
    ).json()
    assert outsider["projects"] == []
    assert outsider["documents"] == []
    assert outsider["channels"] == []
    assert [c["name"] for c in outsider["companies"]] == ["Zephyr Labs 100%"]

    # `%` is literal, not a wildcard.
    literal = (await client.get("/api/v1/search", params={"q": "100%"}, headers=outsider_h)).json()
    assert [c["name"] for c in literal["companies"]] == ["Zephyr Labs 100%"]
    nothing = (await client.get("/api/v1/search", params={"q": "%"}, headers=outsider_h)).json()
    assert nothing["projects"] == []
    assert nothing["documents"] == []
