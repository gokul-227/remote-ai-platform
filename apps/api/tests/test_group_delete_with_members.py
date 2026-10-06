"""Deleting a group that has members and posts (found by the Postman contract run).

The ORM used to null out group_memberships.group_id / group_posts.group_id
before deleting the group, which violates their NOT NULL constraints (500).
The rows belong to the group and go with it (ON DELETE CASCADE).
"""

from httpx import AsyncClient


async def test_owner_can_delete_a_group_with_members_and_posts(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    created = await client.post("/api/v1/groups", json={"name": "Rust guild"}, headers=auth_headers)
    assert created.status_code == 201, created.text
    group_id = created.json()["id"]
    post = await client.post(f"/api/v1/groups/{group_id}/posts", json={"content": "Welcome!"}, headers=auth_headers)
    assert post.status_code == 201, post.text

    deleted = await client.delete(f"/api/v1/groups/{group_id}", headers=auth_headers)
    assert deleted.status_code == 204, deleted.text
    gone = await client.get(f"/api/v1/groups/{group_id}", headers=auth_headers)
    assert gone.status_code == 404
