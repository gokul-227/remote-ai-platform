import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.core.feature_flags import get_all_flags, is_feature_enabled


def test_unknown_flag_name_is_disabled():
    """Checking a flag name that isn't registered fails closed, not raises."""
    assert is_feature_enabled("some_flag_that_does_not_exist") is False


def test_flags_read_live_settings(monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_AI_MATCHING", False)
    assert is_feature_enabled("ai_matching") is False
    flags = get_all_flags()
    assert flags["ai_matching"] is False
    # Unrelated flags are unaffected.
    assert flags["ai_resume_parsing"] is True


@pytest.mark.asyncio
async def test_feature_flags_endpoint_requires_admin(client: AsyncClient):
    reporter = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "not-admin-flags@example.com",
            "password": "secure-pass",
            "full_name": "Not Admin",
            "role": "ENGINEER",
        },
    )
    headers = {"Authorization": f"Bearer {reporter.json()['access_token']}"}

    resp = await client.get("/api/v1/admin/feature-flags", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_feature_flags_endpoint_returns_current_state(client: AsyncClient):
    from conftest import TestingSessionLocal
    from app.domains.auth.models import User, UserRole
    from auth_support import token_for as create_access_token

    async with TestingSessionLocal() as db:
        admin = User(
            email="flags-admin@example.com",
            full_name="Flags Admin",
            role=UserRole.ADMIN,
        )
        db.add(admin)
        await db.flush()
        token = create_access_token(admin)
        await db.commit()
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/api/v1/admin/feature-flags", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "flags" in body
    assert set(body["flags"]) == {"ai_resume_parsing", "ai_matching", "job_aggregator"}
    assert body["flags"]["ai_resume_parsing"] is True
