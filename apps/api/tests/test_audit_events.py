"""
Tests for Centralized Immutable Audit Logging Subsystem.
Verifies audit trail persistence, payload sanitization, and admin retrieval.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import sanitize_payload
from app.domains.auth.models import User, UserRole


def test_sanitize_payload_redaction():
    raw_payload = {
        "email": "engineer@workmesh.ai",
        "password": "superSecretPassword123!",
        "access_token": "eyJhbGciOi...",
        "client_secret": "sensitiveSecretValue",
        "nested": {
            "api_key": "groq_live_key_999",
            "safe_metadata": "public_info",
        },
        "safe_field": 42,
    }
    sanitized = sanitize_payload(raw_payload)

    assert sanitized["email"] == "engineer@workmesh.ai"
    assert sanitized["password"] == "[REDACTED]"
    assert sanitized["access_token"] == "[REDACTED]"
    assert sanitized["client_secret"] == "[REDACTED]"
    assert sanitized["nested"]["api_key"] == "[REDACTED]"
    assert sanitized["nested"]["safe_metadata"] == "public_info"
    assert sanitized["safe_field"] == 42


@pytest.mark.asyncio
async def test_audit_event_logged_on_login(client: AsyncClient, test_user: User, db: AsyncSession):
    # 1. Promote test_user to ADMIN to read audit trail
    test_user.role = UserRole.ADMIN
    await db.commit()

    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email": test_user.email, "password": "TestPassword123!"},
    )
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 2. Fetch audit events
    audit_resp = await client.get("/api/v1/admin/audit-events", headers=admin_headers)
    assert audit_resp.status_code == 200
    events = audit_resp.json()
    assert len(events) >= 1

    login_events = [e for e in events if e["action"] == "USER_LOGIN"]
    assert len(login_events) >= 1
    latest_login = login_events[0]
    assert latest_login["resource_type"] == "USER"
    assert latest_login["actor_id"] == str(test_user.id)
    assert "email" in latest_login["payload"]
