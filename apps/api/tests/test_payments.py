import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.projects.models import Project


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
