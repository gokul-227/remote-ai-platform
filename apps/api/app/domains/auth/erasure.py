"""Account erasure shared by self-service deletion and admin deletion (DATA-01, DATA-04).

Order matters:
1. Resume file removed from object storage.
2. Tombstone written and the user row deleted in one commit. From here on
   every token for the subject is refused (auth/service.py), including tokens
   minted later by refreshing an old session.
3. The Supabase user is erased (email, OAuth links, sessions). If that fails
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
from app.domains.auth import supabase_admin
from app.domains.auth.models import DeletedIdentity, User, identity_hash
from app.domains.engineers.models import EngineerProfile

logger = get_logger("auth.erasure")


async def erase_account(db: AsyncSession, user: User) -> None:
    """Delete the account and its data, then the identity-provider user.

    The caller has already checked permissions and records_to_keep. Commits.
    """
    from app.domains.engineers.service import _resume_object_key

    profile = await db.scalar(select(EngineerProfile).where(EngineerProfile.user_id == user.id))
    if profile and profile.resume_url:
        await get_storage().delete_file(settings.MINIO_BUCKET_RESUMES, _resume_object_key(profile.resume_url))

    subject = user.auth_subject
    user_id = str(user.id)
    tombstone: DeletedIdentity | None = None
    if subject:
        tombstone = await db.merge(
            DeletedIdentity(
                subject_hash=identity_hash(subject),
                deleted_at=datetime.now(UTC),
                pending_subject=subject,
                provider_erased_at=None,
                provider_attempts=0,
                last_error=None,
            )
        )
    await db.delete(user)
    await db.commit()
    logger.info("Account deleted", user_id=user_id)

    if tombstone is not None:
        await erase_provider_identity(db, tombstone)


async def erase_provider_identity(db: AsyncSession, tombstone: DeletedIdentity) -> bool:
    """Try to erase the Supabase user behind a tombstone. Never raises. Commits."""
    subject = tombstone.pending_subject
    if not subject:
        return True
    if not supabase_admin.is_configured():
        # Nothing can erase it here; stays pending and visible to operators.
        return False
    try:
        await supabase_admin.delete_identity(subject)
    except Exception as exc:  # noqa: BLE001 - recorded and retried, never undoes the app erasure
        tombstone.provider_attempts = (tombstone.provider_attempts or 0) + 1
        tombstone.last_error = type(exc).__name__[:64]
        await db.commit()
        logger.warning(
            "Supabase identity not erased; will retry",
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
