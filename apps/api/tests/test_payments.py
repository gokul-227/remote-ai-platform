import pytest
from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.projects.models import Project
from conftest import engine


@pytest.mark.asyncio
async def test_wallet_overview_and_escrow_workflow(client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession):
    # Setup company & project
    test_user.role = UserRole.COMPANY
    await db.commit()

    company = CompanyProfile(user_id=test_user.id, name="Payments Test Corp")
    db.add(company)
    await db.flush()

    project = Project(company_id=company.id, title="Escrow Project", description="Description", status="ACTIVE")
    db.add(project)
    await db.flush()

    # Register worker
    worker_res = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "payee_worker@example.com",
            "password": "Password123!",
            "full_name": "Payee Worker",
            "role": "ENGINEER",
        },
    )
    worker_id = worker_res.json()["user"]["id"]

    # Check initial wallet balance
    wallet_res = await client.get("/api/v1/payments/wallet", headers=auth_headers)
    assert wallet_res.status_code == 200
    assert wallet_res.json()["escrow_held"] == 0.0

    # Create Escrow Payment
    escrow_res = await client.post(
        "/api/v1/payments/escrow",
        json={
            "project_id": str(project.id),
            "payee_id": worker_id,
            "amount": 2500.0,
            "currency": "USD",
        },
        headers=auth_headers,
    )
    assert escrow_res.status_code == 201
    payment_data = escrow_res.json()
    assert payment_data["amount"] == 2500.0
    assert payment_data["status"] == "ESCROWED"
    payment_id = payment_data["id"]

    # Verify wallet reflects held escrow
    wallet_after_res = await client.get("/api/v1/payments/wallet", headers=auth_headers)
    assert wallet_after_res.status_code == 200
    assert wallet_after_res.json()["escrow_held"] == 2500.0

    # Release Escrow Payment
    release_res = await client.post(f"/api/v1/payments/{payment_id}/release", headers=auth_headers)
    assert release_res.status_code == 200
    assert release_res.json()["status"] == "RELEASED"
    assert release_res.json()["released_at"] is not None

    # Check transaction history
    txs_res = await client.get("/api/v1/payments/transactions", headers=auth_headers)
    assert txs_res.status_code == 200
    assert len(txs_res.json()) >= 1


@pytest.mark.asyncio
async def test_list_transactions_query_count_is_not_n_plus_one(
    client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession
):
    """Regression test for the N+1 previously in GET /payments/transactions.

    Each _enrich_transaction() call used to issue 2 User gets per
    transaction, so listing N transactions cost ~2N queries. The fixed
    handler batch-fetches payer/payee users, so the query count should stay
    flat as the number of transactions grows.
    """
    test_user.role = UserRole.COMPANY
    await db.commit()

    company = CompanyProfile(user_id=test_user.id, name="N+1 Test Corp")
    db.add(company)
    await db.flush()

    project = Project(
        company_id=company.id, title="N+1 Project", description="Description", status="ACTIVE"
    )
    db.add(project)
    await db.flush()

    tx_count = 6
    for i in range(tx_count):
        worker_res = await client.post(
            "/api/v1/auth/register",
            json={
                "email": f"payee_nplus1_{i}@example.com",
                "password": "Password123!",
                "full_name": f"Payee {i}",
                "role": "ENGINEER",
            },
        )
        worker_id = worker_res.json()["user"]["id"]
        escrow_res = await client.post(
            "/api/v1/payments/escrow",
            json={
                "project_id": str(project.id),
                "payee_id": worker_id,
                "amount": 100.0,
                "currency": "USD",
            },
            headers=auth_headers,
        )
        assert escrow_res.status_code == 201

    queries: list[str] = []

    def _count_query(conn, cursor, statement, parameters, context, executemany):
        queries.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", _count_query)
    try:
        res = await client.get("/api/v1/payments/transactions", headers=auth_headers)
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", _count_query)

    assert res.status_code == 200
    assert len(res.json()) == tx_count
    # Fixed handler: 1 query for transactions + 1 for users (plus a small,
    # fixed overhead for auth/session lookups), regardless of tx_count. A
    # regression back to per-row gets would scale with tx_count instead.
    assert len(queries) <= 6, (
        f"expected a small, constant number of queries, got {len(queries)} for "
        f"{tx_count} transactions -- looks like an N+1 regression"
    )


@pytest.mark.asyncio
async def test_escrow_idempotency_key(client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession):
    test_user.role = UserRole.COMPANY
    await db.commit()

    company = CompanyProfile(user_id=test_user.id, name="Idempotency Test Corp")
    db.add(company)
    await db.flush()

    project = Project(company_id=company.id, title="Idempotent Project", description="Desc", status="ACTIVE")
    db.add(project)
    await db.flush()

    worker_res = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "idemp_worker@example.com",
            "password": "Password123!",
            "full_name": "Idemp Worker",
            "role": "ENGINEER",
        },
    )
    worker_id = worker_res.json()["user"]["id"]

    idempotency_key = "unique_request_tx_12345"

    # First call creates transaction
    resp1 = await client.post(
        f"/api/v1/payments/escrow?idempotency_key={idempotency_key}",
        json={
            "project_id": str(project.id),
            "payee_id": worker_id,
            "amount": 500.0,
            "currency": "USD",
        },
        headers=auth_headers,
    )
    assert resp1.status_code == 201
    tx_id_1 = resp1.json()["id"]

    # Second call with same idempotency_key returns existing transaction without duplicate creation
    resp2 = await client.post(
        f"/api/v1/payments/escrow?idempotency_key={idempotency_key}",
        json={
            "project_id": str(project.id),
            "payee_id": worker_id,
            "amount": 500.0,
            "currency": "USD",
        },
        headers=auth_headers,
    )
    assert resp2.status_code == 201
    tx_id_2 = resp2.json()["id"]
    assert tx_id_1 == tx_id_2
