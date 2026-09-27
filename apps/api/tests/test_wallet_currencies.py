"""PAY-02: amounts in different currencies are never added together."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.projects.models import PaymentTransaction, Project


@pytest.mark.asyncio
async def test_wallet_totals_are_per_currency(client: AsyncClient, test_user: User, auth_headers: dict, db: AsyncSession):
    test_user.role = UserRole.COMPANY
    company = CompanyProfile(user_id=test_user.id, name=f"Wallet Co {uuid.uuid4().hex[:6]}")
    db.add(company)
    await db.flush()
    project = Project(company_id=company.id, title="P", description="d", status="ACTIVE")
    db.add(project)
    await db.flush()
    worker = User(email=f"w-{uuid.uuid4().hex[:6]}@example.com", full_name="W", role=UserRole.ENGINEER, is_active=True)
    db.add(worker)
    await db.flush()
    for amount, currency, status in [(100, "EUR", "ESCROWED"), (100, "USD", "ESCROWED"), (50, "EUR", "RELEASED")]:
        db.add(PaymentTransaction(project_id=project.id, payer_id=test_user.id, payee_id=worker.id,
                                  amount=amount, currency=currency, status=status, provider="STRIPE",
                                  provider_reference=f"pi_{uuid.uuid4().hex}"))
    await db.commit()

    w = (await client.get("/api/v1/payments/wallet", headers=auth_headers)).json()
    by = {b["currency"]: b for b in w["by_currency"]}
    assert by["EUR"]["escrow_held"] == 100 and by["EUR"]["total_spent"] == 150 and by["EUR"]["total_released"] == 50
    assert by["USD"]["escrow_held"] == 100 and by["USD"]["total_spent"] == 100
    # Mixed currencies: no single total is claimed.
    assert w["currency"] is None and w["escrow_held"] is None
