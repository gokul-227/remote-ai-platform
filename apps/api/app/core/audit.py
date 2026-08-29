"""
Centralized Immutable Audit Logging Utility.
Sanitizes sensitive keys before persisting events.
"""

import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.admin.models import AuditEvent

SENSITIVE_KEYS = {
    "password",
    "password_hash",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "client_secret",
    "jwt_secret_key",
    "authorization",
}


def sanitize_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    if not payload:
        return {}
    sanitized: dict[str, Any] = {}
    for k, v in payload.items():
        if any(s in k.lower() for s in SENSITIVE_KEYS):
            sanitized[k] = "[REDACTED]"
        elif isinstance(v, dict):
            sanitized[k] = sanitize_payload(v)
        else:
            sanitized[k] = v
    return sanitized


async def record_audit_event(
    db: AsyncSession,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    actor_id: uuid.UUID | None = None,
    actor_role: str | None = None,
    payload: dict[str, Any] | None = None,
    request: Request | None = None,
) -> AuditEvent:
    ip_address = None
    user_agent = None

    if request:
        client = getattr(request, "client", None)
        if client:
            ip_address = getattr(client, "host", None)
        user_agent = request.headers.get("user-agent")

    event = AuditEvent(
        actor_id=actor_id,
        actor_role=actor_role,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
        ip_address=ip_address,
        user_agent=user_agent[:500] if user_agent else None,
        payload=sanitize_payload(payload),
    )
    db.add(event)
    await db.flush()
    return event
