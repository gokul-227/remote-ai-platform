"""Tests for the Groups & Communities domain."""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.domains.groups.schemas import (
    GroupCreate,
    GroupUpdate,
    GroupPostCreate,
    MemberRoleUpdate,
)


# ── Schema validation tests ───────────────────────────────────────────────────

class TestGroupCreate:
    def test_valid_group_create(self):
        g = GroupCreate(name="Python Devs", description="A group for Python developers", category="technology")
        assert g.name == "Python Devs"
        assert g.category == "technology"
        assert g.is_private is False

    def test_name_strip_whitespace(self):
        g = GroupCreate(name="  Rust Engineers  ")
        assert g.name == "Rust Engineers"

    def test_blank_name_raises(self):
        with pytest.raises(Exception):
            GroupCreate(name="   ")

    def test_name_too_short_raises(self):
        with pytest.raises(Exception):
            GroupCreate(name="A")

    def test_tags_default_empty(self):
        g = GroupCreate(name="Remote Workers")
        assert g.tags == []

    def test_private_group(self):
        g = GroupCreate(name="Private Club", is_private=True)
        assert g.is_private is True


class TestGroupUpdate:
    def test_partial_update(self):
        u = GroupUpdate(description="New description")
        assert u.description == "New description"
        assert u.name is None
        assert u.tags is None

    def test_update_tags(self):
        u = GroupUpdate(tags=["python", "backend"])
        assert u.tags == ["python", "backend"]


class TestGroupPostCreate:
    def test_valid_post(self):
        p = GroupPostCreate(content="Hello group!")
        assert p.content == "Hello group!"
        assert p.media_urls == []

    def test_post_with_media(self):
        p = GroupPostCreate(content="Check this out", media_urls=["https://example.com/img.png"])
        assert len(p.media_urls) == 1

    def test_empty_content_raises(self):
        with pytest.raises(Exception):
            GroupPostCreate(content="")


class TestMemberRoleUpdate:
    def test_valid_roles(self):
        for role in ("member", "moderator", "admin"):
            r = MemberRoleUpdate(role=role)
            assert r.role == role

    def test_invalid_role_raises(self):
        with pytest.raises(Exception):
            MemberRoleUpdate(role="superadmin")


# ── Slugify helper tests ──────────────────────────────────────────────────────

class TestSlugify:
    def test_basic_slug(self):
        from app.domains.groups.router import _slugify
        assert _slugify("Python Developers") == "python-developers"

    def test_special_chars_stripped(self):
        from app.domains.groups.router import _slugify
        assert _slugify("React & Vue!") == "react-vue"

    def test_multiple_spaces(self):
        from app.domains.groups.router import _slugify
        assert _slugify("AI   Machine   Learning") == "ai-machine-learning"

    def test_already_slug(self):
        from app.domains.groups.router import _slugify
        assert _slugify("remote-work") == "remote-work"


# ── Integration-style tests with mocked DB ────────────────────────────────────

class TestGroupRouter:
    """Integration-style tests using mocked AsyncSession."""

    def _make_group(self, **kwargs) -> MagicMock:
        g = MagicMock()
        g.id = uuid.uuid4()
        g.name = kwargs.get("name", "Test Group")
        g.slug = kwargs.get("slug", "test-group")
        g.description = kwargs.get("description", None)
        g.category = kwargs.get("category", "general")
        g.tags = kwargs.get("tags", [])
        g.avatar_url = None
        g.banner_url = None
        g.is_private = kwargs.get("is_private", False)
        g.is_verified = False
        g.member_count = kwargs.get("member_count", 0)
        g.post_count = kwargs.get("post_count", 0)
        g.owner_id = kwargs.get("owner_id", uuid.uuid4())
        from datetime import datetime, timezone
        g.created_at = datetime.now(timezone.utc)
        return g

    def _make_membership(self, group_id, user_id, role="member", status="active") -> MagicMock:
        m = MagicMock()
        m.id = uuid.uuid4()
        m.group_id = group_id
        m.user_id = user_id
        m.role = role
        m.status = status
        from datetime import datetime, timezone
        m.joined_at = datetime.now(timezone.utc)
        return m

    def _make_user(self, role="ENGINEER"):
        u = MagicMock()
        u.id = uuid.uuid4()
        u.role = MagicMock()
        u.role.value = role
        return u

    @pytest.mark.asyncio
    async def test_join_group_creates_membership(self):
        """Joining a public group creates an active membership."""
        user = self._make_user()
        group = self._make_group(owner_id=uuid.uuid4())

        db = AsyncMock()
        db.execute = AsyncMock()

        # Simulate group found, no existing membership
        group_result = MagicMock()
        group_result.scalar_one_or_none.return_value = group
        mem_result = MagicMock()
        mem_result.scalar_one_or_none.return_value = None

        db.execute.side_effect = [group_result, mem_result]
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        added = []
        db.add = lambda x: added.append(x)

        from app.domains.groups.router import join_group
        result = await join_group(group_id=group.id, db=db, current_user=user)

        assert len(added) == 1
        membership = added[0]
        assert membership.group_id == group.id
        assert membership.user_id == user.id
        assert membership.status == "active"

    @pytest.mark.asyncio
    async def test_join_private_group_creates_pending(self):
        """Joining a private group creates a pending membership."""
        user = self._make_user()
        group = self._make_group(is_private=True, owner_id=uuid.uuid4())

        db = AsyncMock()
        group_result = MagicMock()
        group_result.scalar_one_or_none.return_value = group
        mem_result = MagicMock()
        mem_result.scalar_one_or_none.return_value = None

        db.execute.side_effect = [group_result, mem_result]
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        added = []
        db.add = lambda x: added.append(x)

        from app.domains.groups.router import join_group
        result = await join_group(group_id=group.id, db=db, current_user=user)

        membership = added[0]
        assert membership.status == "pending"

    @pytest.mark.asyncio
    async def test_join_twice_raises_conflict(self):
        """Joining a group you're already a member of raises 409."""
        user = self._make_user()
        group = self._make_group(owner_id=uuid.uuid4())
        existing_mem = self._make_membership(group.id, user.id)

        db = AsyncMock()
        group_result = MagicMock()
        group_result.scalar_one_or_none.return_value = group
        mem_result = MagicMock()
        mem_result.scalar_one_or_none.return_value = existing_mem

        db.execute.side_effect = [group_result, mem_result]

        from app.domains.groups.router import join_group
        with pytest.raises(HTTPException) as exc:
            await join_group(group_id=group.id, db=db, current_user=user)

        assert exc.value.status_code == 409

    @pytest.mark.asyncio
    async def test_join_banned_user_raises_403(self):
        """Banned user cannot rejoin."""
        user = self._make_user()
        group = self._make_group(owner_id=uuid.uuid4())
        banned_mem = self._make_membership(group.id, user.id, status="banned")

        db = AsyncMock()
        group_result = MagicMock()
        group_result.scalar_one_or_none.return_value = group
        mem_result = MagicMock()
        mem_result.scalar_one_or_none.return_value = banned_mem

        db.execute.side_effect = [group_result, mem_result]

        from app.domains.groups.router import join_group
        with pytest.raises(HTTPException) as exc:
            await join_group(group_id=group.id, db=db, current_user=user)

        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_leave_group_as_owner_raises_400(self):
        """Owner cannot leave — must transfer ownership first."""
        user = self._make_user()
        group = self._make_group(owner_id=user.id)
        membership = self._make_membership(group.id, user.id, role="admin")

        db = AsyncMock()
        group_result = MagicMock()
        group_result.scalar_one_or_none.return_value = group
        mem_result = MagicMock()
        mem_result.scalar_one_or_none.return_value = membership

        db.execute.side_effect = [group_result, mem_result]

        from app.domains.groups.router import leave_group
        with pytest.raises(HTTPException) as exc:
            await leave_group(group_id=group.id, db=db, current_user=user)

        assert exc.value.status_code == 400

    @pytest.mark.asyncio
    async def test_delete_group_by_non_owner_raises_403(self):
        """Non-owner ENGINEER cannot delete group."""
        user = self._make_user(role="ENGINEER")
        group = self._make_group(owner_id=uuid.uuid4())  # different owner

        db = AsyncMock()
        group_result = MagicMock()
        group_result.scalar_one_or_none.return_value = group

        db.execute.side_effect = [group_result]

        from app.domains.groups.router import delete_group
        with pytest.raises(HTTPException) as exc:
            await delete_group(group_id=group.id, db=db, current_user=user)

        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_update_group_requires_admin(self):
        """Non-admin members cannot update group metadata."""
        user = self._make_user()
        group = self._make_group(owner_id=uuid.uuid4())
        membership = self._make_membership(group.id, user.id, role="member")

        db = AsyncMock()
        group_result = MagicMock()
        group_result.scalar_one_or_none.return_value = group
        mem_result = MagicMock()
        mem_result.scalar_one_or_none.return_value = membership

        db.execute.side_effect = [group_result, mem_result]

        from app.domains.groups.router import update_group
        with pytest.raises(HTTPException) as exc:
            await update_group(
                group_id=group.id,
                body=GroupUpdate(description="Hacked!"),
                db=db,
                current_user=user,
            )

        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_post_in_private_group_requires_membership(self):
        """Non-members cannot post in private groups."""
        user = self._make_user()
        group = self._make_group(is_private=True, owner_id=uuid.uuid4())

        db = AsyncMock()
        group_result = MagicMock()
        group_result.scalar_one_or_none.return_value = group
        mem_result = MagicMock()
        mem_result.scalar_one_or_none.return_value = None  # not a member

        db.execute.side_effect = [group_result, mem_result]

        from app.domains.groups.router import create_group_post
        with pytest.raises(HTTPException) as exc:
            await create_group_post(
                group_id=group.id,
                body=GroupPostCreate(content="Hello!"),
                db=db,
                current_user=user,
            )

        assert exc.value.status_code == 403
