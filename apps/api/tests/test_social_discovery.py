import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole
from app.domains.network.models import Connection
from app.domains.social.models import Post


@pytest.mark.asyncio
async def test_discovery_search_respects_audience_and_literal_wildcards(client, db: AsyncSession, test_user, auth_headers):
    other = User(id=uuid.uuid4(), auth_subject=str(uuid.uuid4()), email="discovery@example.com",
                 full_name="Discovery Author", role=UserRole.ENGINEER, is_active=True)
    db.add(other)
    await db.flush()
    public = Post(author_id=other.id, content="Hiring 100% remote", visibility="PUBLIC")
    restricted = Post(author_id=other.id, content="Hiring 100% remote privately", visibility="CONNECTIONS")
    private = Post(author_id=other.id, content="Hiring 100% secret", visibility="PRIVATE")
    db.add_all([public, restricted, private, Post(author_id=other.id, content="Hiring remotely", visibility="PUBLIC")])
    await db.commit()
    url = "/api/v1/social/posts/public"
    response = await client.get(url, params={"q": "100%"}, headers=auth_headers)
    assert response.status_code == 200
    assert [p["id"] for p in response.json()["posts"]] == [str(public.id)]
    db.add(Connection(sender_id=test_user.id, receiver_id=other.id, status="ACCEPTED"))
    await db.commit()
    connected = await client.get("/api/v1/social/feed", params={"q": "100%"}, headers=auth_headers)
    assert {p["id"] for p in connected.json()["posts"]} == {str(public.id), str(restricted.id)}
    assert (await client.get(url, params={"q": "x" * 201}, headers=auth_headers)).status_code == 422
    assert (await client.get(url, params={"order": "invalid"}, headers=auth_headers)).status_code == 422


@pytest.mark.asyncio
async def test_popular_order_is_global_and_pages_do_not_repeat(client, db: AsyncSession, test_user, auth_headers):
    posts = [Post(author_id=test_user.id, content=f"Discovery {i}", visibility="PUBLIC", like_count=i) for i in range(7)]
    db.add_all(posts)
    await db.commit()
    for path in ("/api/v1/social/feed", "/api/v1/social/posts/public"):
        ids = []
        for page in range(1, 5):
            response = await client.get(path, params={"order": "most_liked", "page": page, "page_size": 2,
                                                     "q": "discovery"}, headers=auth_headers)
            assert response.status_code == 200
            body = response.json()
            assert body["total"] == 7
            assert body["has_more"] == (page < 4)
            ids.extend(p["id"] for p in body["posts"])
        assert ids == [str(p.id) for p in reversed(posts)]
