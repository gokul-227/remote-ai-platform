import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole


@pytest.mark.asyncio
async def test_celery_health_reflects_real_broker_state(
    client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession, monkeypatch
):
    """Regression test: the Celery health check used to delegate to a helper
    that swallows every Redis error and returns a default value, so it could
    never observe a broker outage and always reported OPERATIONAL. It should
    now report the same status as the (already-correct) Redis check, since
    both ping the same broker.
    """
    test_user.role = UserRole.ADMIN
    await db.commit()

    res = await client.get("/api/v1/admin/health/details", headers=auth_headers)
    assert res.status_code == 200
    services = {s["service"]: s["status"] for s in res.json()["services"]}
    assert services["Celery Background Task Queue"] == services["Redis Cache & Session Broker"]

    # Now point the broker at an address nothing is listening on and confirm
    # the Celery check actually goes DOWN rather than staying OPERATIONAL.
    from app.core.config import settings

    monkeypatch.setattr(settings, "CELERY_BROKER_URL", "redis://127.0.0.1:1/0")
    res = await client.get("/api/v1/admin/health/details", headers=auth_headers)
    assert res.status_code == 200
    services = {s["service"]: s["status"] for s in res.json()["services"]}
    assert services["Celery Background Task Queue"] == "DOWN"
