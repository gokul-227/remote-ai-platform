import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole
from app.domains.social.models import Post, PostComment, PostLike


@pytest.mark.asyncio
async def test_create_and_get_post(client: AsyncClient, test_user: User, auth_headers: dict[str, str]):
    # Create post
    payload = {
        "content": "Excited to share our new AI remote work features!",
        "visibility": "PUBLIC",
    }
    response = await client.post("/api/v1/social/posts", json=payload, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["content"] == payload["content"]
    assert data["author"]["id"] == str(test_user.id)
    assert data["like_count"] == 0
    assert data["comment_count"] == 0

    post_id = data["id"]

    # Get post by ID
    get_res = await client.get(f"/api/v1/social/posts/{post_id}", headers=auth_headers)
    assert get_res.status_code == 200
    assert get_res.json()["id"] == post_id


@pytest.mark.asyncio
async def test_post_like_toggle(client: AsyncClient, test_user: User, auth_headers: dict[str, str]):
    # Create post
    create_res = await client.post(
        "/api/v1/social/posts",
        json={"content": "Testing likes"},
        headers=auth_headers,
    )
    post_id = create_res.json()["id"]

    # Like post
    like_res = await client.post(f"/api/v1/social/posts/{post_id}/like", headers=auth_headers)
    assert like_res.status_code == 200
    assert like_res.json()["liked"] is True
    assert like_res.json()["like_count"] == 1

    # Unlike post
    unlike_res = await client.post(f"/api/v1/social/posts/{post_id}/like", headers=auth_headers)
    assert unlike_res.status_code == 200
    assert unlike_res.json()["liked"] is False
    assert unlike_res.json()["like_count"] == 0


@pytest.mark.asyncio
async def test_post_comments(client: AsyncClient, test_user: User, auth_headers: dict[str, str]):
    # Create post
    create_res = await client.post(
        "/api/v1/social/posts",
        json={"content": "Post with comments"},
        headers=auth_headers,
    )
    post_id = create_res.json()["id"]

    # Add comment
    comment_res = await client.post(
        f"/api/v1/social/posts/{post_id}/comments",
        json={"content": "Great update!"},
        headers=auth_headers,
    )
    assert comment_res.status_code == 201
    assert comment_res.json()["content"] == "Great update!"
    comment_id = comment_res.json()["id"]

    # List comments
    list_res = await client.get(f"/api/v1/social/posts/{post_id}/comments", headers=auth_headers)
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    # Delete comment
    del_res = await client.delete(
        f"/api/v1/social/posts/{post_id}/comments/{comment_id}",
        headers=auth_headers,
    )
    assert del_res.status_code == 204


@pytest.mark.asyncio
async def test_social_feed(client: AsyncClient, test_user: User, auth_headers: dict[str, str]):
    # Create public post
    await client.post(
        "/api/v1/social/posts",
        json={"content": "Feed post 1", "visibility": "PUBLIC"},
        headers=auth_headers,
    )

    feed_res = await client.get("/api/v1/social/feed", headers=auth_headers)
    assert feed_res.status_code == 200
    feed_data = feed_res.json()
    assert "posts" in feed_data
    assert feed_data["total"] >= 1
