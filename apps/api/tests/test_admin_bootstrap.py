"""ADMIN_EMAILS grants staff access on sign-in to listed emails only, and never demotes."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domains.admin.models import AuditEvent


async def _register(client: AsyncClient, email: str):
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Boot", "role": "ENGINEER"},
    )
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.mark.asyncio
async def test_listed_email_becomes_admin_others_do_not(client: AsyncClient, db: AsyncSession, monkeypatch):
    listed = f"owner_{uuid.uuid4().hex[:6]}@example.com"
    monkeypatch.setattr(settings, "ADMIN_EMAILS_RAW", f" {listed.upper()} , other@example.com")
    h = await _register(client, listed)
    assert (await client.get("/api/v1/auth/me", headers=h)).json()["role"] == "ADMIN"
    assert (await client.get("/api/v1/admin/support/tickets", headers=h)).status_code == 200
    events = (await db.execute(select(AuditEvent).where(AuditEvent.action == "admin.bootstrap"))).scalars().all()
    assert len(events) == 1

    stranger = await _register(client, f"someone_{uuid.uuid4().hex[:6]}@example.com")
    assert (await client.get("/api/v1/auth/me", headers=stranger)).json()["role"] == "ENGINEER"


@pytest.mark.asyncio
async def test_empty_setting_grants_nothing(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAILS_RAW", "")
    h = await _register(client, f"x_{uuid.uuid4().hex[:6]}@example.com")
    assert (await client.get("/api/v1/auth/me", headers=h)).json()["role"] == "ENGINEER"
