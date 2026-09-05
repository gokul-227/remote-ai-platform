import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.core.feature_flags import get_all_flags, is_feature_enabled


def test_unconfigured_flag_defaults_to_disabled():
    """A flag with nothing set in the environment must default to False.

    FEATURE_TRENDING_SKILLS and FEATURE_STALE_MATCH_RECOMPUTE gate stub
    implementations with no real logic behind them yet -- they must never
    read as enabled unless someone explicitly opts in.
    """
    assert is_feature_enabled("trending_skills") is False
    assert is_feature_enabled("stale_match_recompute") is False


def test_unknown_flag_name_is_disabled():
    """Checking a flag name that isn't registered fails closed, not raises."""
    assert is_feature_enabled("some_flag_that_does_not_exist") is False


def test_explicitly_enabled_flag_reads_as_enabled(monkeypatch):
    """Reading a flag whose backing env var/setting was explicitly set to true."""
    monkeypatch.setattr(settings, "FEATURE_TRENDING_SKILLS", True)
    assert is_feature_enabled("trending_skills") is True
    # Unrelated flags are unaffected.
    assert is_feature_enabled("stale_match_recompute") is False


def test_get_all_flags_reflects_live_settings(monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_STALE_MATCH_RECOMPUTE", True)
    flags = get_all_flags()
    assert flags["stale_match_recompute"] is True
    assert flags["trending_skills"] is False
    # Always-on flags from the existing FEATURE_* settings are included too.
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
    from app.domains.auth.router import create_access_token

    async with TestingSessionLocal() as db:
        admin = User(
            email="flags-admin@example.com",
            password_hash="hashed",
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
    assert body["flags"]["trending_skills"] is False
    assert body["flags"]["stale_match_recompute"] is False
    assert body["flags"]["ai_resume_parsing"] is True
