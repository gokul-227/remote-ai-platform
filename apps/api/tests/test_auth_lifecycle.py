"""
Tests for Authentication Lifecycle — Password Reset, Password Change, and Session Revocation.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_forgot_and_reset_password_flow(client: AsyncClient):
    # 1. Register a test user
    email = "lifecycle_test@workmesh.ai"
    reg_resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "initialPassword123!",
            "full_name": "Lifecycle Test User",
            "role": "ENGINEER",
        },
    )
    assert reg_resp.status_code == 200
    old_token = reg_resp.json()["access_token"]

    # 2. Request forgot password token
    forgot_resp = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": email},
    )
    assert forgot_resp.status_code == 200
    data = forgot_resp.json()
    reset_token = data.get("reset_token")
    assert reset_token is not None

    # 3. Reset password using token
    reset_resp = await client.post(
        "/api/v1/auth/reset-password",
        json={
            "token": reset_token,
            "new_password": "newSecurePassword456!",
        },
    )
    assert reset_resp.status_code == 200
    assert "successful" in reset_resp.json()["message"]

    # 4. Old token should now be rejected due to token_version increment (session revocation)
    me_resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old_token}"})
    assert me_resp.status_code == 401

    # 5. Token reuse must fail
    reuse_resp = await client.post(
        "/api/v1/auth/reset-password",
        json={
            "token": reset_token,
            "new_password": "anotherPassword789!",
        },
    )
    assert reuse_resp.status_code == 400

    # 6. Login with new password succeeds
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "newSecurePassword456!"},
    )
    assert login_resp.status_code == 200


@pytest.mark.asyncio
async def test_change_password_and_logout_all(client: AsyncClient):
    # 1. Register user
    email = "change_pwd_test@workmesh.ai"
    reg_resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "initialPassword123!",
            "full_name": "Change Pwd User",
            "role": "COMPANY",
        },
    )
    assert reg_resp.status_code == 200
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Change password with wrong current password fails
    wrong_pwd_resp = await client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={
            "current_password": "wrongPassword123!",
            "new_password": "brandNewPassword789!",
        },
    )
    assert wrong_pwd_resp.status_code == 400

    # 3. Change password with correct current password succeeds
    change_resp = await client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={
            "current_password": "initialPassword123!",
            "new_password": "brandNewPassword789!",
        },
    )
    assert change_resp.status_code == 200
    new_token = change_resp.json()["access_token"]
    new_headers = {"Authorization": f"Bearer {new_token}"}

    # 4. Old token revoked
    old_me = await client.get("/api/v1/auth/me", headers=headers)
    assert old_me.status_code == 401

    # 5. New token works
    new_me = await client.get("/api/v1/auth/me", headers=new_headers)
    assert new_me.status_code == 200

    # 6. Logout all sessions
    logout_all_resp = await client.post("/api/v1/auth/logout-all", headers=new_headers)
    assert logout_all_resp.status_code == 200

    # 7. Session immediately invalidated
    post_logout_me = await client.get("/api/v1/auth/me", headers=new_headers)
    assert post_logout_me.status_code == 401
