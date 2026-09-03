import pytest
from httpx import AsyncClient


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "secure-pass-123", "full_name": email.split("@")[0], "role": "ENGINEER"},
    )
    body = resp.json()
    return body["user"]["id"], f"Bearer {resp.json()['access_token']}"


@pytest.mark.asyncio
async def test_stranger_cannot_read_like_or_comment_on_private_post(client: AsyncClient):
    author_id, author_auth = await _register(client, "private-post-author@example.com")
    _, stranger_auth = await _register(client, "private-post-stranger@example.com")

    create_resp = await client.post(
        "/api/v1/social/posts",
        json={"content": "For my eyes only", "visibility": "PRIVATE"},
        headers={"Authorization": author_auth},
    )
    assert create_resp.status_code == 201
    post_id = create_resp.json()["id"]

    stranger_headers = {"Authorization": stranger_auth}
    assert (await client.get(f"/api/v1/social/posts/{post_id}", headers=stranger_headers)).status_code == 404
    assert (await client.post(f"/api/v1/social/posts/{post_id}/like", headers=stranger_headers)).status_code == 404
    assert (await client.get(f"/api/v1/social/posts/{post_id}/comments", headers=stranger_headers)).status_code == 404
    assert (
        await client.post(
            f"/api/v1/social/posts/{post_id}/comments",
            json={"content": "sneaking in"},
            headers=stranger_headers,
        )
    ).status_code == 404

    # The author can still read their own private post.
    own = await client.get(f"/api/v1/social/posts/{post_id}", headers={"Authorization": author_auth})
    assert own.status_code == 200


@pytest.mark.asyncio
async def test_stranger_can_read_public_post(client: AsyncClient):
    _, author_auth = await _register(client, "public-post-author@example.com")
    _, stranger_auth = await _register(client, "public-post-stranger@example.com")

    create_resp = await client.post(
        "/api/v1/social/posts",
        json={"content": "Hello world", "visibility": "PUBLIC"},
        headers={"Authorization": author_auth},
    )
    post_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/social/posts/{post_id}", headers={"Authorization": stranger_auth})
    assert resp.status_code == 200
