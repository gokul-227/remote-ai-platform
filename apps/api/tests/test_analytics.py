"""
Tests for the first-party analytics funnel-tracking domain.

Covers: anonymous + authenticated event ingestion, that a client cannot
spoof another user's user_id, unknown event_name rejection, the rate
limiter tier for the ingestion endpoint, and admin-only access to the
funnel summary endpoint.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limiter import get_route_tier
from app.domains.analytics.models import AnalyticsEvent
from app.domains.auth.models import User, UserRole


@pytest.mark.asyncio
async def test_ingest_event_anonymous(client: AsyncClient, db: AsyncSession):
    resp = await client.post(
        "/api/v1/analytics/events",
        json={"event_name": "cta_clicked", "properties": {"cta": "find_your_next_role"}},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["event_name"] == "cta_clicked"
    assert body["user_id"] is None
    assert body["properties"] == {"cta": "find_your_next_role"}

    result = await db.execute(select(AnalyticsEvent))
    events = result.scalars().all()
    assert len(events) == 1
    assert events[0].user_id is None


@pytest.mark.asyncio
async def test_ingest_event_authenticated_attributes_to_caller(
    client: AsyncClient, test_user: User, auth_headers: dict[str, str]
):
    resp = await client.post(
        "/api/v1/analytics/events",
        json={"event_name": "search_performed", "properties": {"has_query": True}},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["user_id"] == str(test_user.id)


@pytest.mark.asyncio
async def test_client_cannot_spoof_user_id(
    client: AsyncClient, test_user: User, auth_headers: dict[str, str]
):
    """A client-supplied user_id in the request body must be ignored entirely
    — the backend always derives user_id from the bearer token."""
    other_user_id = str(uuid.uuid4())
    resp = await client.post(
        "/api/v1/analytics/events",
        json={
            "event_name": "search_performed",
            "properties": {},
            "user_id": other_user_id,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["user_id"] == str(test_user.id)
    assert body["user_id"] != other_user_id


@pytest.mark.asyncio
async def test_ingest_event_unauthenticated_cannot_set_user_id(client: AsyncClient):
    other_user_id = str(uuid.uuid4())
    resp = await client.post(
        "/api/v1/analytics/events",
        json={"event_name": "cta_clicked", "properties": {}, "user_id": other_user_id},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["user_id"] is None


@pytest.mark.asyncio
async def test_unknown_event_name_rejected(client: AsyncClient):
    resp = await client.post(
        "/api/v1/analytics/events",
        json={"event_name": "totally_made_up_event", "properties": {}},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_properties_are_sanitized_and_capped(client: AsyncClient):
    long_value = "x" * 2000
    many_props = {f"key_{i}": "v" for i in range(50)}
    many_props["long"] = long_value
    many_props["nested"] = {"a": 1}
    resp = await client.post(
        "/api/v1/analytics/events",
        json={"event_name": "cta_clicked", "properties": many_props},
    )
    assert resp.status_code == 201, resp.text
    stored = resp.json()["properties"]
    assert len(stored) <= 20
    if "long" in stored:
        assert len(stored["long"]) <= 500
    assert "nested" not in stored


def test_analytics_events_rate_limit_tier_is_stricter_than_default():
    default_tier = get_route_tier("/api/v1/network/conversations")
    analytics_tier = get_route_tier("/api/v1/analytics/events")
    assert analytics_tier is not None
    assert default_tier is not None
    assert analytics_tier[0] < default_tier[0]


@pytest.mark.asyncio
async def test_summary_requires_admin_role(client: AsyncClient, auth_headers: dict[str, str]):
    resp = await client.get("/api/v1/analytics/events/summary", headers=auth_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_summary_rejects_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/v1/analytics/events/summary")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_summary_returns_counts_grouped_by_event_and_day(
    client: AsyncClient, test_user: User, db: AsyncSession
):
    test_user.role = UserRole.ADMIN
    await db.commit()
    from app.domains.auth.router import create_access_token

    admin_headers = {"Authorization": f"Bearer {create_access_token(test_user)}"}

    for _ in range(3):
        r = await client.post(
            "/api/v1/analytics/events", json={"event_name": "cta_clicked", "properties": {}}
        )
        assert r.status_code == 201
    r = await client.post(
        "/api/v1/analytics/events", json={"event_name": "search_performed", "properties": {}}
    )
    assert r.status_code == 201

    resp = await client.get("/api/v1/analytics/events/summary", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    by_event = {row["event_name"]: row["count"] for row in rows}
    assert by_event.get("cta_clicked") == 3
    assert by_event.get("search_performed") == 1
