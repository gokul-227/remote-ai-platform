import pytest
from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole
from conftest import engine


@pytest.mark.asyncio
async def test_create_and_get_contract(client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession):
    # Set company role for test user to create contract
    test_user.role = UserRole.COMPANY
    await db.commit()

    # Create worker user
    worker_res = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "worker_contract@example.com",
            "password": "Password123!",
            "full_name": "Contract Worker",
            "role": "ENGINEER",
        },
    )
    worker_id = worker_res.json()["user"]["id"]

    # Create contract
    contract_payload = {
        "worker_id": worker_id,
        "title": "Senior Python Development Engagement",
        "scope_description": "Deliver microservices and FastAPI architecture for platform.",
        "rate_type": "HOURLY",
        "rate_amount": 85.0,
        "currency": "USD",
        "terms": "Standard remote engagement terms.",
        "milestones": [
            {"title": "Initial Setup & Architecture", "amount": 1500.0},
            {"title": "Core API Delivery", "amount": 3500.0},
        ],
    }

    res = await client.post("/api/v1/contracts", json=contract_payload, headers=auth_headers)
    assert res.status_code == 201
    contract_data = res.json()
    assert contract_data["title"] == contract_payload["title"]
    assert contract_data["status"] == "OFFERED"
    assert len(contract_data["milestones"]) == 2

    contract_id = contract_data["id"]

    # Get contract details
    get_res = await client.get(f"/api/v1/contracts/{contract_id}", headers=auth_headers)
    assert get_res.status_code == 200
    assert get_res.json()["id"] == contract_id


@pytest.mark.asyncio
async def test_digital_sign_contract(client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession):
    test_user.role = UserRole.COMPANY
    await db.commit()

    worker_res = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "worker_sign@example.com",
            "password": "Password123!",
            "full_name": "Worker Signer",
            "role": "ENGINEER",
        },
    )
    worker_id = worker_res.json()["user"]["id"]
    worker_token = worker_res.json()["access_token"]
    worker_headers = {"Authorization": f"Bearer {worker_token}"}

    # Create contract
    res = await client.post(
        "/api/v1/contracts",
        json={
            "worker_id": worker_id,
            "title": "Contract To Sign",
            "scope_description": "Scope",
            "rate_amount": 5000.0,
        },
        headers=auth_headers,
    )
    contract_id = res.json()["id"]

    # Client signs contract
    client_sign_res = await client.post(f"/api/v1/contracts/{contract_id}/sign", headers=auth_headers)
    assert client_sign_res.status_code == 200
    assert client_sign_res.json()["client_signed_at"] is not None
    assert client_sign_res.json()["status"] == "SIGNED"

    # Worker signs contract -> status becomes ACTIVE
    worker_sign_res = await client.post(f"/api/v1/contracts/{contract_id}/sign", headers=worker_headers)
    assert worker_sign_res.status_code == 200
    assert worker_sign_res.json()["worker_signed_at"] is not None
    assert worker_sign_res.json()["status"] == "ACTIVE"


@pytest.mark.asyncio
async def test_list_my_contracts_query_count_is_not_n_plus_one(
    client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession
):
    """Regression test for the N+1 previously in GET /contracts/me.

    Each _enrich_contract() call used to issue a refresh + 2 User gets + a
    milestone SELECT per contract, so listing N contracts cost ~4N queries.
    The fixed handler batch-fetches users and milestones, so the query count
    should stay flat as the number of contracts grows.
    """
    test_user.role = UserRole.COMPANY
    await db.commit()

    contract_count = 6
    for i in range(contract_count):
        worker_res = await client.post(
            "/api/v1/auth/register",
            json={
                "email": f"worker_nplus1_{i}@example.com",
                "password": "Password123!",
                "full_name": f"Worker {i}",
                "role": "ENGINEER",
            },
        )
        worker_id = worker_res.json()["user"]["id"]
        create_res = await client.post(
            "/api/v1/contracts",
            json={
                "worker_id": worker_id,
                "title": f"Contract {i}",
                "scope_description": "Scope",
                "rate_amount": 1000.0,
                "milestones": [
                    {"title": "M1", "amount": 500.0},
                    {"title": "M2", "amount": 500.0},
                ],
            },
            headers=auth_headers,
        )
        assert create_res.status_code == 201

    queries: list[str] = []

    def _count_query(conn, cursor, statement, parameters, context, executemany):
        queries.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", _count_query)
    try:
        res = await client.get("/api/v1/contracts/me", headers=auth_headers)
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", _count_query)

    assert res.status_code == 200
    assert len(res.json()) == contract_count
    # Fixed handler: 1 query for contracts + 1 for users + 1 for milestones
    # (plus a small, fixed overhead for auth/session lookups), regardless of
    # contract_count. A regression back to per-row queries would scale with
    # contract_count (~4 queries per contract).
    assert len(queries) <= 8, (
        f"expected a small, constant number of queries, got {len(queries)} for "
        f"{contract_count} contracts -- looks like an N+1 regression"
    )
