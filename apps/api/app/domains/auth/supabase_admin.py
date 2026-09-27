"""Supabase Auth Admin API: the one call this app needs.

Used only to erase the Supabase user when its owner deletes their account.
Active only when SUPABASE_SERVICE_ROLE_KEY is configured.
"""

import uuid

import httpx

from app.core.config import settings


def is_configured() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY)


async def delete_identity(subject: str) -> bool:
    """Delete the Supabase Auth user (and with it their sessions and linked
    OAuth identities). True if deleted or already gone."""
    user_id = uuid.UUID(subject)  # Supabase subjects are UUIDs; never interpolate anything else
    url = f"{str(settings.SUPABASE_URL).rstrip('/')}/auth/v1/admin/users/{user_id}"
    key = settings.SUPABASE_SERVICE_ROLE_KEY
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.delete(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    if resp.status_code == 404:
        return True
    resp.raise_for_status()
    return True
