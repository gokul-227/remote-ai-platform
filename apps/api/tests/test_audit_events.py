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
