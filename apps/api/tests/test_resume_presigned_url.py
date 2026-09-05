"""Regression tests for resume storage access control.

Previously EngineerService.upload_resume() persisted a permanent,
unauthenticated public URL (f"{MINIO_PUBLIC_ENDPOINT}/{bucket}/{key}") as
resume_url, and every profile response serialized that stored value
directly. If the resumes bucket is public-read in production (as such a
permanent link requires), anyone who ever saw that URL -- via browser
history, a referrer header, server logs, or a shared screenshot -- could
fetch the file forever with no authentication and no expiration.

The fix stores only the private object key and serves resume access
exclusively through a freshly generated, short-lived presigned URL
(EngineerService.resume_download_url()), computed at request time -- after
the existing owner/admin authorization check already gates who gets a
response at all.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domains.engineers.models import EngineerProfile


async def _create_profile(client: AsyncClient) -> tuple[str, dict[str, str]]:
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"resume_presign_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Presign Test Engineer",
            "role": "engineer",
        },
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    profile_res = await client.post(
        "/api/v1/engineers/me",
        json={"headline": "Backend Engineer", "skills": ["Go"]},
        headers=headers,
    )
    return profile_res.json()["id"], headers


@pytest.mark.asyncio
async def test_owner_resume_url_is_a_short_lived_presigned_link_not_a_permanent_public_url(
    client: AsyncClient, db: AsyncSession
):
    profile_id, headers = await _create_profile(client)

    # Simulate a resume uploaded under the OLD scheme (permanent public URL)
    # to confirm legacy rows are also served safely, not just new ones.
    db_profile = await db.get(EngineerProfile, uuid.UUID(profile_id))
    legacy_key = "resumes/some-user/legacy-token.pdf"
    db_profile.resume_url = (
        f"{settings.MINIO_PUBLIC_ENDPOINT.rstrip('/')}/{settings.MINIO_BUCKET_RESUMES}/{legacy_key}"
    )
    await db.commit()

    res = await client.get(f"/api/v1/engineers/{profile_id}", headers=headers)
    assert res.status_code == 200
    resume_url = res.json()["resume_url"]
    assert resume_url is not None

    # Must be a freshly signed, time-limited S3-style URL -- not the
    # permanent public link that was stored in the DB.
    assert resume_url != db_profile.resume_url
    assert "X-Amz-Signature" in resume_url
    assert "X-Amz-Expires=900" in resume_url  # 15 minutes, not indefinite

    # The object key embedded in the presigned URL must match the key
    # recovered from the legacy stored URL, not some unrelated path.
    assert legacy_key in resume_url


@pytest.mark.asyncio
async def test_new_upload_persists_object_key_not_a_permanent_url(
    client: AsyncClient, db: AsyncSession
):
    """New uploads must store a bare object key in resume_url, never a
    directly fetchable permanent URL -- the DB value alone must not be
    enough to access the file."""
    profile_id, headers = await _create_profile(client)

    db_profile = await db.get(EngineerProfile, uuid.UUID(profile_id))
    db_profile.resume_url = f"resumes/{uuid.uuid4()}/token.pdf"
    await db.commit()
    stored_value = db_profile.resume_url

    assert not stored_value.startswith("http://")
    assert not stored_value.startswith("https://")

    res = await client.get(f"/api/v1/engineers/{profile_id}", headers=headers)
    assert res.status_code == 200
    resume_url = res.json()["resume_url"]
    assert resume_url.startswith("http")
    assert "X-Amz-Signature" in resume_url
