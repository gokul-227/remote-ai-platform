"""
Authentication routes.

Sign-in, sign-up, password-less codes, OAuth and token refresh all happen in
Supabase Auth; this router only exposes the signed-in user's own record,
their role choice, and session revocation.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit_event
from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.auth.schemas import UserResponse, UserUpdate
from app.services.ai.metering import current_ai_actor, usage_summary

router = APIRouter(prefix="/auth", tags=["Authentication"])


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
