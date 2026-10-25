"""Public pages expose only what members made public; suspended accounts never appear."""

import uuid

import pytest
from conftest import TestingSessionLocal
from httpx import AsyncClient

from app.domains.auth.models import User, UserRole
from app.domains.engineers.models import EngineerProfile
from app.domains.social.models import Post


async def _member(public: bool = True, active: bool = True) -> tuple[User, EngineerProfile]:
    async with TestingSessionLocal() as db:
        user = User(email=f"p_{uuid.uuid4().hex[:8]}@example.com", full_name="Pat Public", role=UserRole.ENGINEER)
        user.is_active = active
        db.add(user)
        await db.flush()
        profile = EngineerProfile(user_id=user.id, headline="Data engineer", is_public=public)
        db.add(profile)
        await db.commit()
        return user, profile


async def _post(author: User, visibility: str) -> uuid.UUID:
    async with TestingSessionLocal() as db:
        post = Post(author_id=author.id, content="Hello world", visibility=visibility)
        db.add(post)
        await db.commit()
        return post.id


@pytest.mark.asyncio
async def test_public_post_is_readable_without_sign_in(client: AsyncClient):
    user, profile = await _member()
    pid = await _post(user, "PUBLIC")
    r = await client.get(f"/api/v1/public/posts/{pid}")
    assert r.status_code == 200
    assert r.json()["author"] == {"name": "Pat Public", "headline": "Data engineer", "profile_id": str(profile.id)}


@pytest.mark.asyncio
async def test_private_content_and_suspended_accounts_stay_hidden(client: AsyncClient):
    user, _ = await _member()
    hidden = await _post(user, "CONNECTIONS")
    assert (await client.get(f"/api/v1/public/posts/{hidden}")).status_code == 404
    gone, gone_profile = await _member(active=False)
    gone_post = await _post(gone, "PUBLIC")
    assert (await client.get(f"/api/v1/public/posts/{gone_post}")).status_code == 404
    private, private_profile = await _member(public=False)
    people = {e["id"] for e in (await client.get("/api/v1/public/sitemap-entries?kind=people")).json()}
    assert str(private_profile.id) not in people
    assert str(gone_profile.id) not in people
    posts = {e["id"] for e in (await client.get("/api/v1/public/sitemap-entries?kind=posts")).json()}
    assert str(hidden) not in posts
    assert str(gone_post) not in posts


@pytest.mark.asyncio
async def test_private_profile_author_is_shown_by_name_only(client: AsyncClient):
    user, _ = await _member(public=False)
    pid = await _post(user, "PUBLIC")
    author = (await client.get(f"/api/v1/public/posts/{pid}")).json()["author"]
    assert author == {"name": "Pat Public", "headline": None, "profile_id": None}
