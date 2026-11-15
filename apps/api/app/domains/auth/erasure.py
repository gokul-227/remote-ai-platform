"""Account erasure shared by self-service deletion and admin deletion (DATA-01, DATA-04).

Order matters:
1. Resume file removed from object storage.
2. Tombstone written and the user row deleted in one commit. From here on
   every token for the subject is refused (auth/service.py), including tokens
   minted later by refreshing an old session.
3. The identity-provider users (Supabase, and WorkOS once linked) are erased
   (email, OAuth links, sessions). If that fails
   the tombstone keeps the subject in `pending_subject` and the erasure is
   retried by `retry_pending_erasures` (six-hourly scheduled sync and the
   admin endpoint) until it succeeds.
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.core.storage import get_storage
from app.domains.auth import supabase_admin, workos_client
from app.domains.auth.models import DeletedIdentity, User, UserIdentity, identity_hash
from app.domains.engineers.models import EngineerProfile

logger = get_logger("auth.erasure")

# Identity providers whose user this app can erase: module with
# is_configured() and async delete_identity(subject).
ERASERS = {"supabase": supabase_admin, "workos": workos_client}


async def erase_account(db: AsyncSession, user: User) -> None:
    """Delete the account and its data, then the identity-provider user.

    The caller has already checked permissions and records_to_keep. Commits.
    """
    from app.domains.engineers.service import _resume_object_key

    profile = await db.scalar(select(EngineerProfile).where(EngineerProfile.user_id == user.id))
    if profile and profile.resume_url:
        await get_storage().delete_file(
            settings.MINIO_BUCKET_RESUMES, _resume_object_key(profile.resume_url)
        )

    user_id = str(user.id)
    # Every identity that can sign in to this account: the Supabase subject and
    # each linked identity (WorkOS, extra issuers). Each gets a tombstone; only
    # providers this app can erase keep a pending subject.
    subjects: list[tuple[str, str]] = []
    if user.auth_subject:
        subjects.append(("supabase", user.auth_subject))
    linked = (await db.scalars(select(UserIdentity).where(UserIdentity.user_id == user.id))).all()
    subjects.extend((row.provider, row.subject) for row in linked)
    tombstones: list[DeletedIdentity] = []
    for provider, subject in subjects:
        erasable = provider in ERASERS
        tombstones.append(
            await db.merge(
                DeletedIdentity(
                    subject_hash=identity_hash(subject, provider),
                    deleted_at=datetime.now(UTC),
                    # Other extra issuers are only blocked locally.
                    pending_subject=subject if erasable else None,
                    provider_erased_at=None,
                    provider_attempts=0,
                    last_error=None,
                    provider=provider,
                )
            )
        )
    for link in linked:
        await db.delete(link)
    await db.delete(user)
    await db.commit()
    logger.info("Account deleted", user_id=user_id)

    for tombstone in tombstones:
        await erase_provider_identity(db, tombstone)


async def erase_provider_identity(db: AsyncSession, tombstone: DeletedIdentity) -> bool:
    """Try to erase the Supabase user behind a tombstone. Never raises. Commits."""
    subject = tombstone.pending_subject
    if not subject:
        return True
    eraser = ERASERS.get(tombstone.provider or "supabase")
    if eraser is None or not eraser.is_configured():
        # Nothing can erase it here; stays pending and visible to operators.
        return False
    try:
        await eraser.delete_identity(subject)
    except Exception as exc:  # noqa: BLE001 - recorded and retried, never undoes the app erasure
        tombstone.provider_attempts = (tombstone.provider_attempts or 0) + 1
        tombstone.last_error = type(exc).__name__[:64]
        await db.commit()
        logger.warning(
            "Identity-provider user not erased; will retry",
            subject_hash=tombstone.subject_hash[:12],
            attempts=tombstone.provider_attempts,
            error=tombstone.last_error,
        )
        return False
    tombstone.pending_subject = None
    tombstone.provider_erased_at = datetime.now(UTC)
    tombstone.provider_attempts = (tombstone.provider_attempts or 0) + 1
    tombstone.last_error = None
    await db.commit()
    return True


async def retry_pending_erasures(db: AsyncSession, limit: int = 50) -> dict[str, int]:
    """Retry identity-provider erasures that have not succeeded yet."""
    rows = (
        await db.scalars(
            select(DeletedIdentity)
            .where(DeletedIdentity.pending_subject.is_not(None))
            .order_by(DeletedIdentity.deleted_at)
            .limit(limit)
        )
    ).all()
    erased = 0
    for row in rows:
        if await erase_provider_identity(db, row):
            erased += 1
    remaining = len(rows) - erased
    if remaining:
        logger.warning("Identity erasures still pending", pending=remaining)
    return {"erased": erased, "pending": remaining}
