"""
Authentication routes.

Sign-in, sign-up, password-less codes, OAuth and token refresh all happen in
Supabase Auth; this router only exposes the signed-in user's own record,
their role choice, and session revocation.
"""

import enum
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit_event
from app.core.config import settings
from app.core.database import Base, get_db
from app.core.logging import get_logger
from app.core.storage import get_storage
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.auth.schemas import UserResponse, UserUpdate
from app.domains.engineers.models import EngineerProfile
from app.domains.engineers.service import _resume_object_key
from app.services.ai.metering import current_ai_actor, usage_summary

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = get_logger("auth.router")


@router.post("/logout-all")
async def logout_all_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Reject every access token issued so far, on every device.

    Refresh tokens are held by the identity provider: the client must also
    call Supabase's global sign-out so no new access token can be minted.
    """
    current_user.sessions_revoked_at = datetime.now(UTC)
    await record_audit_event(
        db=db,
        action="LOGOUT_ALL_SESSIONS",
        resource_type="USER",
        resource_id=str(current_user.id),
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        payload={},
    )
    await db.commit()
    return {"message": "All active sessions have been successfully revoked."}


@router.get("/me/ai-usage")
async def my_ai_usage(current_user: User = Depends(get_current_user)) -> dict[str, int | None]:
    """This month's AI token use and allowance (null allowance = unlimited)."""
    actor = current_ai_actor()
    assert actor is not None  # set by get_current_user
    return await usage_summary(actor)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current_user: User = Depends(get_current_user)) -> None:
    """Acknowledge sign-out. The session itself is ended client-side with Supabase."""
    return None


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return currently authenticated user information."""
    return UserResponse.model_validate(current_user)


@router.patch("/role", response_model=UserResponse)
async def update_role(
    role: UserRole,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update current user role during onboarding choice (ENGINEER or COMPANY only)."""
    if role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Cannot self-assign admin role"
        )
    repo = UserRepository(db)
    updated_user = await repo.update(current_user, UserUpdate(role=role))
    await record_audit_event(
        db=db,
        action="ROLE_SWITCHED",
        resource_type="USER",
        resource_id=str(current_user.id),
        actor_id=current_user.id,
        actor_role=role.value,
        payload={"new_role": role.value},
    )
    await db.commit()
    return UserResponse.model_validate(updated_user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    full_name: str = Body(..., embed=True, min_length=1, max_length=255),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update the current user's own display name.

    Deliberately narrow — email/phone/avatar changes are not implemented
    (no verification flow, storage integration, or phone column exist yet),
    so this endpoint only accepts what's actually safe to change instantly.
    """
    repo = UserRepository(db)
    updated_user = await repo.update(current_user, UserUpdate(full_name=full_name))
    await db.commit()
    return UserResponse.model_validate(updated_user)


# Columns that are secrets or capabilities rather than personal data.
_EXPORT_SKIP_COLUMNS = {"resume_url", "auth_subject", "idempotency_key", "provider_reference"}


def _jsonable(value: object) -> object:
    if isinstance(value, uuid.UUID | datetime):
        return str(value)
    if isinstance(value, enum.Enum):
        return value.value
    return value


@router.get("/me/export")
async def export_my_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Everything stored about the signed-in user (GDPR access and portability).

    Walks every table with a foreign key to users.id and returns the rows
    that reference this user, so newly added tables are included
    automatically.
    """
    data: dict[str, object] = {
        "exported_at": datetime.now(UTC).isoformat(),
        "account": UserResponse.model_validate(current_user).model_dump(mode="json"),
    }
    for table in Base.metadata.sorted_tables:
        if table.name == "users":
            continue
        columns = [
            c for c in table.columns
            if any(fk.column.table.name == "users" for fk in c.foreign_keys)
        ]
        if not columns:
            continue
        rows = (
            await db.execute(select(table).where(or_(*[c == current_user.id for c in columns])))
        ).mappings().all()
        if rows:
            data[table.name] = [
                {k: _jsonable(v) for k, v in row.items() if k not in _EXPORT_SKIP_COLUMNS}
                for row in rows
            ]
    await record_audit_event(
        db=db, action="DATA_EXPORTED", resource_type="USER", resource_id=str(current_user.id),
        actor_id=current_user.id, actor_role=current_user.role.value, payload={},
    )
    await db.commit()
    return JSONResponse(
        data,
        headers={"Content-Disposition": 'attachment; filename="remote-ai-platform-data.json"'},
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    confirm: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete the signed-in user's account and data (GDPR erasure).

    Every foreign key to users.id cascades, so the profile, applications,
    messages sent, posts, saved jobs and so on go with the account. The
    stored resume file is removed from object storage first.
    """
    if confirm != "DELETE":
        raise HTTPException(status_code=422, detail='Type "DELETE" to confirm.')
    if current_user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator accounts must be removed by another administrator.",
        )
    profile = await db.scalar(select(EngineerProfile).where(EngineerProfile.user_id == current_user.id))
    if profile and profile.resume_url:
        await get_storage().delete_file(
            settings.MINIO_BUCKET_RESUMES, _resume_object_key(profile.resume_url)
        )
    logger.info("Account deleted by its owner", user_id=str(current_user.id))
    await db.delete(current_user)
    await db.commit()
