"""Phase 04 IDOR audit: public trust endpoints respect profile visibility and
never expose staff notes, reviewer identity or rejected requests."""

import uuid

import pytest
from auth_support import token_for
from httpx import AsyncClient
from sqlalchemy import select


async def _professional(client: AsyncClient, *, public: bool):
    from conftest import TestingSessionLocal

    from app.domains.auth.models import User

    email = f"t-{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/api/v1/auth/register", json={"email": email, "password": "p", "full_name": "T", "role": "ENGINEER"})
    async with TestingSessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == email))
    headers = {"Authorization": f"Bearer {token_for(user)}"}
    created = await client.post(
        "/api/v1/engineers/me", headers=headers, json={"headline": "H", "skills": ["x"], "is_public": public}
    )
    assert created.status_code == 201
    return user


async def _verifications(user, admin_id):
    from conftest import TestingSessionLocal

    from app.domains.trust.models import UserVerification

    async with TestingSessionLocal() as db:
        db.add_all([
            UserVerification(user_id=user.id, verification_type="IDENTITY", status="VERIFIED", reviewed_by_id=admin_id,
                             verifier_notes="checked passport"),
            UserVerification(user_id=user.id, verification_type="SKILL", status="REJECTED", reviewed_by_id=admin_id,
                             verifier_notes="document looked altered"),
        ])
        await db.commit()


@pytest.mark.asyncio
async def test_hidden_professional_trust_data_is_not_public(client: AsyncClient):
    hidden = await _professional(client, public=False)
    stranger = await _professional(client, public=True)
    for path in (f"/api/v1/trust/scores/{hidden.id}", f"/api/v1/trust/reviews/{hidden.id}",
                 f"/api/v1/trust/verifications/{hidden.id}"):
        assert (await client.get(path)).status_code == 404, path
        assert (await client.get(path, headers={"Authorization": f"Bearer {token_for(stranger)}"})).status_code == 404
        assert (await client.get(path, headers={"Authorization": f"Bearer {token_for(hidden)}"})).status_code == 200


@pytest.mark.asyncio
async def test_public_view_shows_only_verified_badges_without_staff_details(client: AsyncClient):
    person = await _professional(client, public=True)
    admin = await _professional(client, public=True)
    await _verifications(person, admin.id)

    public = (await client.get(f"/api/v1/trust/verifications/{person.id}")).json()
    assert [v["verification_type"] for v in public] == ["IDENTITY"]
    assert all("verifier_notes" not in v and "reviewed_by_id" not in v for v in public)

    own = (await client.get(f"/api/v1/trust/verifications/{person.id}",
                            headers={"Authorization": f"Bearer {token_for(person)}"})).json()
    assert {v["status"] for v in own} == {"VERIFIED", "REJECTED"}
