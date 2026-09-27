import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole


@pytest.mark.asyncio
async def test_redis_health_reflects_real_connectivity(
    client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession, monkeypatch
):
    """The admin health view must report Redis DOWN when it is unreachable,
    never a hardcoded OPERATIONAL."""
    from app.core.config import settings

    test_user.role = UserRole.ADMIN
    await db.commit()
    monkeypatch.setattr(settings, "REDIS_URL", "redis://127.0.0.1:1/0")
    res = await client.get("/api/v1/admin/health/details", headers=auth_headers)
    assert res.status_code == 200
    services = {s["service"]: s["status"] for s in res.json()["services"]}
    assert services["Redis Cache & Session Broker"] == "DOWN"
    assert "Supabase Auth" in services
    assert not any("Celery" in s or "Keycloak" in s for s in services)


def test_redis_url_falls_back_to_the_legacy_broker_variable(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setattr(settings, "CELERY_BROKER_URL", "rediss://hosted.example:6379")
    assert settings.redis_url == "rediss://hosted.example:6379"
    monkeypatch.setattr(settings, "REDIS_URL", "rediss://primary.example:6379")
    assert settings.redis_url == "rediss://primary.example:6379"


def test_redis_keys_are_namespaced_by_environment(monkeypatch):
    from app.core.cache import RedisCache
    from app.core.config import settings
    from app.domains.network.router import ConnectionManager

    monkeypatch.setattr(settings, "APP_ENV", "production")
    assert RedisCache("jobs")._key("search:x") == "production:jobs:search:x"
    assert ConnectionManager._channel(__import__("uuid").UUID(int=1)).startswith("production:ws_messages:")
    monkeypatch.setattr(settings, "APP_ENV", "development")
    assert settings.redis_key("ratelimit:a") == "development:ratelimit:a"
