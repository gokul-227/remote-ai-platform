"""Channel search preserves live permissions and searches literal, undeleted history."""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from test_channels import _connect, _user

from app.domains.channels.models import ChannelMessage


@pytest.mark.asyncio
async def test_search_threads_literal_text_deletion_and_revoked_membership(client: AsyncClient, db: AsyncSession):
    owner, headers = await _user(client)
    member, member_headers = await _user(client)
    _, outsider = await _user(client)
    await _connect(db, owner, member)
    channel = (await client.post("/api/v1/channels", headers=headers, json={
        "kind": "GROUP", "name": "Searchable", "member_ids": [str(member)],
    })).json()["id"]
    base = f"/api/v1/channels/{channel}"
    root = (await client.post(f"{base}/messages", headers=headers, json={"body": "Release 100%_ready / tomorrow"})).json()
    reply = (await client.post(f"{base}/messages", headers=member_headers, json={
        "body": "CONFIRMED release decision", "parent_id": root["id"],
    })).json()
    deleted = (await client.post(f"{base}/messages", headers=headers, json={"body": "release confidential"})).json()
    await client.delete(f"{base}/messages/{deleted['id']}", headers=headers)
    result = await client.get(f"{base}/search", headers=member_headers, params={"q": "release"})
    assert result.status_code == 200, result.text
    assert {item["id"] for item in result.json()["items"]} == {root["id"], reply["id"]}
    assert next(item for item in result.json()["items"] if item["id"] == reply["id"])["parent_id"] == root["id"]
    for literal in ("%_", "/ tomorrow"):
        found = (await client.get(f"{base}/search", headers=headers, params={"q": literal})).json()
        assert [item["id"] for item in found["items"]] == [root["id"]]
    assert (await client.get(f"{base}/search", headers=outsider, params={"q": "release"})).status_code == 404
    await client.delete(f"{base}/members/{member}", headers=headers)
    assert (await client.get(f"{base}/search", headers=member_headers, params={"q": "release"})).status_code == 404
    assert (await client.get(f"{base}/search", headers=headers, params={"q": "  "})).status_code == 422
    assert (await client.get(f"{base}/search", headers=headers, params={"q": "release", "before_id": root["id"]})).status_code == 422


@pytest.mark.asyncio
async def test_search_pages_equal_timestamps_without_omissions_or_duplicates(client: AsyncClient, db: AsyncSession):
    _, headers = await _user(client)
    cid = (await client.post("/api/v1/channels", headers=headers, json={"kind": "GROUP", "name": "Paging"})).json()["id"]
    base = f"/api/v1/channels/{cid}"
    ids = []
    for index in range(5):
        row = (await client.post(f"{base}/messages", headers=headers, json={"body": f"decision {index}"})).json()
        ids.append(row["id"])
    await db.execute(update(ChannelMessage).where(ChannelMessage.channel_id == uuid.UUID(cid)).values(created_at=datetime(2026, 1, 1, tzinfo=UTC)))
    await db.commit()
    found = []
    params = {"q": "decision", "limit": 2}
    while True:
        page = (await client.get(f"{base}/search", headers=headers, params=params)).json()
        found.extend(item["id"] for item in page["items"])
        if not page["has_more"]:
            break
        last = page["items"][-1]
        params.update(before=last["created_at"], before_id=last["id"])
    assert found == sorted(ids, reverse=True)
    assert len(set(found)) == 5
