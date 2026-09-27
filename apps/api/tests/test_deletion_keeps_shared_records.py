"""Phase 14: deleting one person must not erase the other party's signed
contracts or payment records (every FK to users cascades)."""

import uuid
from datetime import UTC, datetime

import pytest
from auth_support import token_for
from httpx import AsyncClient
from sqlalchemy import select


async def _user(client: AsyncClient, role: str = "ENGINEER"):
    from conftest import TestingSessionLocal

    from app.domains.auth.models import User, UserRole

    email = f"d-{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/api/v1/auth/register", json={"email": email, "password": "p", "full_name": "D", "role": "ENGINEER"})
    async with TestingSessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == email))
        if role != "ENGINEER":
            user.role = UserRole[role]
            await db.commit()
        return user


async def _contract(client_id, worker_id, signed: bool):
    from conftest import TestingSessionLocal

    from app.domains.contracts.models import Contract

    async with TestingSessionLocal() as db:
        db.add(Contract(client_id=client_id, worker_id=worker_id, title="Build", scope_description="x",
                        rate_amount=50, worker_signed_at=datetime.now(UTC) if signed else None))
        await db.commit()


def _h(u) -> dict:
    return {"Authorization": f"Bearer {token_for(u)}"}


async def _self_delete(client, u):
    return await client.request("DELETE", "/api/v1/auth/me", headers=_h(u), json={"confirm": "DELETE"})


@pytest.mark.asyncio
async def test_signed_contract_blocks_self_and_admin_deletion(client: AsyncClient):
    org, pro, admin = await _user(client, "COMPANY"), await _user(client), await _user(client, "ADMIN")
    await _contract(org.id, pro.id, signed=True)

    refused = await _self_delete(client, pro)
    assert refused.status_code == 409 and "@" in refused.json()["detail"]  # says where to write
    assert (await client.delete(f"/api/v1/admin/users/{pro.id}", headers=_h(admin))).status_code == 409
    from conftest import TestingSessionLocal

    from app.domains.contracts.models import Contract

    async with TestingSessionLocal() as db:
        assert await db.scalar(select(Contract).where(Contract.worker_id == pro.id)) is not None


@pytest.mark.asyncio
async def test_unsigned_offers_do_not_block_deletion(client: AsyncClient):
    org, pro = await _user(client, "COMPANY"), await _user(client)
    await _contract(org.id, pro.id, signed=False)
    assert (await _self_delete(client, pro)).status_code == 204


@pytest.mark.asyncio
async def test_admin_deletion_audit_keeps_no_email(client: AsyncClient):
    from conftest import TestingSessionLocal

    from app.domains.admin.models import ActivityLog

    target, admin = await _user(client), await _user(client, "ADMIN")
    assert (await client.delete(f"/api/v1/admin/users/{target.id}", headers=_h(admin))).status_code == 204
    async with TestingSessionLocal() as db:
        rows = (await db.scalars(select(ActivityLog).where(ActivityLog.entity_id == str(target.id)))).all()
    assert rows and all(target.email not in str(r.details) for r in rows)
