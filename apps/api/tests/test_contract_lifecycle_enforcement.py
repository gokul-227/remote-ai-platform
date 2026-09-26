"""Server-side contract lifecycle and money-movement gate.

Regression tests for go-live findings B/C/D: a milestone could be set to
PAID (and shown as "Payment released") with no payment behind it, milestone
status could change on an unsigned contract, terms could be edited after one
party had signed, and escrow could be funded/released although the payout
side of the lifecycle does not exist.
"""

import uuid

import pytest
from httpx import AsyncClient


async def _register(client: AsyncClient, role: str) -> tuple[dict[str, str], str]:
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"{role.lower()}_{uuid.uuid4().hex[:10]}@lifecycle-example.com",
            "password": "SecurePass123!",
            "full_name": f"Lifecycle {role.title()}",
            "role": role,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]["id"]


async def _offer(client: AsyncClient) -> tuple[dict, dict, str, str]:
    company, _ = await _register(client, "COMPANY")
    engineer, engineer_id = await _register(client, "ENGINEER")
    resp = await client.post(
        "/api/v1/contracts",
        headers=company,
        json={
            "worker_id": engineer_id,
            "title": "Lifecycle",
            "scope_description": "Scope",
            "rate_amount": 1000,
            "milestones": [{"title": "M1", "amount": 1000}],
        },
    )
    assert resp.status_code == 201
    return company, engineer, resp.json()["id"], resp.json()["milestones"][0]["id"]


async def _set(client: AsyncClient, headers: dict, contract_id: str, ms_id: str, status: str):
    return await client.patch(
        f"/api/v1/contracts/{contract_id}/milestones/{ms_id}/status",
        headers=headers,
        json={"status": status},
    )


async def _sign_both(client: AsyncClient, company: dict, engineer: dict, contract_id: str):
    for headers in (company, engineer):
        resp = await client.post(f"/api/v1/contracts/{contract_id}/sign", headers=headers)
        assert resp.status_code == 200
    return resp.json()


@pytest.mark.asyncio
async def test_milestones_frozen_until_both_parties_sign(client: AsyncClient):
    company, engineer, contract_id, ms_id = await _offer(client)
    assert (await _set(client, engineer, contract_id, ms_id, "IN_PROGRESS")).status_code == 409

    await client.post(f"/api/v1/contracts/{contract_id}/sign", headers=company)
    assert (await _set(client, engineer, contract_id, ms_id, "IN_PROGRESS")).status_code == 409

    await client.post(f"/api/v1/contracts/{contract_id}/sign", headers=engineer)
    assert (await _set(client, engineer, contract_id, ms_id, "IN_PROGRESS")).status_code == 200


@pytest.mark.asyncio
async def test_milestone_transition_graph_and_roles(client: AsyncClient):
    company, engineer, contract_id, ms_id = await _offer(client)
    await _sign_both(client, company, engineer, contract_id)

    # No skipping delivery, and each side only makes its own moves.
    assert (await _set(client, company, contract_id, ms_id, "APPROVED")).status_code == 409
    assert (await _set(client, company, contract_id, ms_id, "DELIVERED")).status_code == 403
    assert (await _set(client, engineer, contract_id, ms_id, "DELIVERED")).status_code == 200
    assert (await _set(client, engineer, contract_id, ms_id, "APPROVED")).status_code == 403

    # Client can send work back, engineer re-delivers, client approves.
    assert (await _set(client, company, contract_id, ms_id, "IN_PROGRESS")).status_code == 200
    assert (await _set(client, engineer, contract_id, ms_id, "DELIVERED")).status_code == 200
    approved = await _set(client, company, contract_id, ms_id, "APPROVED")
    assert approved.status_code == 200 and approved.json()["status"] == "APPROVED"

    # Retrying the same transition is a harmless no-op.
    assert (await _set(client, company, contract_id, ms_id, "APPROVED")).status_code == 200


@pytest.mark.asyncio
async def test_paid_cannot_be_assigned_manually(client: AsyncClient):
    company, engineer, contract_id, ms_id = await _offer(client)
    await _sign_both(client, company, engineer, contract_id)
    await _set(client, engineer, contract_id, ms_id, "DELIVERED")
    await _set(client, company, contract_id, ms_id, "APPROVED")

    paid = await _set(client, company, contract_id, ms_id, "PAID")
    assert paid.status_code == 409
    detail = (await client.get(f"/api/v1/contracts/{contract_id}", headers=company)).json()
    assert detail["milestones"][0]["status"] == "APPROVED"


@pytest.mark.asyncio
async def test_terms_frozen_after_first_signature(client: AsyncClient):
    company, engineer, contract_id, _ = await _offer(client)

    # The engineer cannot add scope to the client's offer.
    added = await client.post(
        f"/api/v1/contracts/{contract_id}/milestones",
        headers=engineer,
        json={"title": "Extra", "amount": 50},
    )
    assert added.status_code == 403

    await client.post(f"/api/v1/contracts/{contract_id}/sign", headers=engineer)

    edit = await client.patch(
        f"/api/v1/contracts/{contract_id}", headers=company, json={"rate_amount": 1}
    )
    assert edit.status_code == 409
    added = await client.post(
        f"/api/v1/contracts/{contract_id}/milestones",
        headers=company,
        json={"title": "Extra", "amount": 50},
    )
    assert added.status_code == 409
    detail = (await client.get(f"/api/v1/contracts/{contract_id}", headers=company)).json()
    assert detail["rate_amount"] == 1000 and len(detail["milestones"]) == 1


@pytest.mark.asyncio
async def test_signing_is_idempotent_and_terminal_states_are_final(client: AsyncClient):
    company, engineer, contract_id, _ = await _offer(client)
    first = await client.post(f"/api/v1/contracts/{contract_id}/sign", headers=company)
    again = await client.post(f"/api/v1/contracts/{contract_id}/sign", headers=company)
    assert again.json()["client_signed_at"] == first.json()["client_signed_at"]
    assert again.json()["status"] == "SIGNED"

    assert (await client.post(f"/api/v1/contracts/{contract_id}/terminate", headers=engineer)).status_code == 200
    assert (await client.post(f"/api/v1/contracts/{contract_id}/terminate", headers=company)).status_code == 409
    assert (await client.post(f"/api/v1/contracts/{contract_id}/sign", headers=engineer)).status_code == 409


@pytest.mark.asyncio
async def test_money_movement_is_gated_by_default(client: AsyncClient):
    company, _ = await _register(client, "COMPANY")
    _, engineer_id = await _register(client, "ENGINEER")
    await client.post("/api/v1/companies/me", headers=company, json={"name": "Gate Co"})
    project = await client.post(
        "/api/v1/projects", headers=company, json={"title": "Gated", "description": "d"}
    )
    project_id = project.json()["id"]
    body = {"project_id": project_id, "payee_id": engineer_id, "amount": 10, "currency": "USD"}
    fake = str(uuid.uuid4())

    assert (await client.post("/api/v1/payments/escrow", headers=company, json=body)).status_code == 503
    assert (await client.post(f"/api/v1/payments/{fake}/release", headers=company)).status_code == 503
    assert (
        await client.post(f"/api/v1/projects/{project_id}/payments/escrow", headers=company, json=body)
    ).status_code == 503
    assert (await client.patch(f"/api/v1/projects/payments/{fake}/release", headers=company)).status_code == 503

    # Refunds are never gated, so an existing hold can always be returned.
    assert (await client.post(f"/api/v1/payments/{fake}/refund", headers=company)).status_code == 404
    assert (await client.patch(f"/api/v1/projects/payments/{fake}/refund", headers=company)).status_code == 404

    wallet = await client.get("/api/v1/payments/wallet", headers=company)
    assert wallet.status_code == 200 and wallet.json()["payments_enabled"] is False
