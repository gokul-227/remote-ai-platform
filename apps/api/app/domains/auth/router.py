import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from jose import jwt
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit_event
from app.core.config import settings
from app.core.database import get_db
from app.core.security import pwd_context
from app.domains.analytics.service import emit_analytics_event
from app.domains.auth.dependencies import get_auth_service, get_current_user
from app.domains.auth.models import PasswordResetToken, User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.auth.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginUrlResponse,
    LogoutUrlResponse,
    RefreshTokenRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from app.domains.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_token(user: User, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(UTC)
    claims = {
        "sub": str(user.keycloak_id or user.id),
        "email": user.email,
        "name": user.full_name,
        "roles": [user.role.value],
        "type": token_type,
        "v": getattr(user, "token_version", 1),
        "exp": int((now + expires_delta).timestamp()),
        "iat": int(now.timestamp()),
    }
    return jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user: User) -> str:
    return create_token(user, "access", timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(user: User) -> str:
    return create_token(user, "refresh", timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS))


@router.post("/register", response_model=TokenResponse)
async def register(
    data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Register a new user directly (Engineer or Company)."""
    if data.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot self-assign admin role",
        )

    repo = UserRepository(db)
    existing = await repo.get_by_email(data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists",
        )

    user_create = UserCreate(
        keycloak_id=str(uuid.uuid4()),
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        is_active=True,
        password_hash=pwd_context.hash(data.password),
    )
    user = await repo.create(user_create)
    token = create_access_token(user)
    await emit_analytics_event(db, "signup_completed", user.id, {"role": data.role.value})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_token=create_refresh_token(user),
        user=UserResponse.model_validate(user),
    )


@router.post("/token", response_model=TokenResponse)
@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Login with email & password (supports form-data and json)."""
    content_type = request.headers.get("content-type", "")
    email_val: str | None = None
    password_val: str | None = None
    if content_type.startswith("application/json"):
        try:
            payload = await request.json()
            data = LoginRequest.model_validate(payload)
        except PydanticValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[
                    {"field": ".".join(str(loc_part) for loc_part in e["loc"]), "msg": e["msg"]}
                    for e in exc.errors()
                ],
            ) from exc
        email_val = str(data.email)
        password_val = data.password
    else:
        form = await request.form()
        raw_email = form.get("username") or form.get("email")
        email_val = str(raw_email) if isinstance(raw_email, str) else None
        raw_pwd = form.get("password")
        password_val = str(raw_pwd) if isinstance(raw_pwd, str) else None
    if not email_val:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email/username is required",
        )

    repo = UserRepository(db)
    user = await repo.get_by_email(email_val)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if (
        not user.password_hash
        or not password_val
        or not pwd_context.verify(password_val, user.password_hash)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive"
        )

    await record_audit_event(
        db=db,
        action="USER_LOGIN",
        resource_type="USER",
        resource_id=str(user.id),
        actor_id=user.id,
        actor_role=user.role.value,
        payload={"email": user.email},
        request=request,
    )

    token = create_access_token(user)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_token=create_refresh_token(user),
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    try:
        claims = jwt.decode(
            body.refresh_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        if claims.get("type") != "refresh":
            raise ValueError("not a refresh token")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from exc
    repo = UserRepository(db)
    sub = claims.get("sub", "")
    user = await repo.get_by_keycloak_id(sub)
    if not user:
        # sub is keycloak_id for password-registered users, but the user's
        # own id for OAuth-created users (they have no keycloak_id) -- same
        # ambiguity as create_token's own `str(user.keycloak_id or user.id)`.
        # Without this fallback, every OAuth-only account's refresh token
        # silently failed to resolve to any user (functional session-handling
        # bug: those users got signed out early with no way to refresh).
        try:
            user = await repo.get_by_id(uuid.UUID(sub))
        except (ValueError, TypeError):
            user = None
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    # Check session revocation
    token_v = claims.get("v")
    if token_v is not None and user.token_version > token_v:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked. Please log in again.",
        )

    return TokenResponse(
        access_token=create_access_token(user),
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_token=create_refresh_token(user),
        user=UserResponse.model_validate(user),
    )


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> ForgotPasswordResponse:
    """Request a password reset link for the given email address."""
    repo = UserRepository(db)
    user = await repo.get_by_email(body.email)
    raw_token = None
    if user and user.is_active:
        raw_token = secrets.token_urlsafe(32)
        token_hash = _hash_token(raw_token)
        expires_at = datetime.now(UTC) + timedelta(hours=1)
        reset_entry = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        db.add(reset_entry)
        await db.commit()

    # Always return success message to prevent user enumeration
    return ForgotPasswordResponse(
        message="If an account with this email exists, a password reset link has been issued.",
        reset_token=raw_token if not settings.is_production else None,
    )


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Reset user password using a valid, unexpired reset token."""
    token_hash = _hash_token(body.token)
    now = datetime.now(UTC)

    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    )
    token_entry = result.scalar_one_or_none()
    if not token_entry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
        )

    user = await db.get(User, token_entry.user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account associated with this token is invalid or inactive.",
        )

    # Update password, invalidate all existing sessions, and mark token used
    user.password_hash = pwd_context.hash(body.new_password)
    user.token_version = (user.token_version or 1) + 1
    token_entry.used_at = now
    await record_audit_event(
        db=db,
        action="PASSWORD_RESET",
        resource_type="USER",
        resource_id=str(user.id),
        actor_id=user.id,
        actor_role=user.role.value,
        payload={},
    )
    await db.commit()

    return {"message": "Password reset successful. Please log in with your new password."}


@router.post("/change-password", response_model=TokenResponse)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Change password for currently authenticated user and refresh session."""
    if not current_user.password_hash or not pwd_context.verify(
        body.current_password, current_user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password verification failed.",
        )

    current_user.password_hash = pwd_context.hash(body.new_password)
    current_user.token_version = (current_user.token_version or 1) + 1
    await record_audit_event(
        db=db,
        action="PASSWORD_CHANGED",
        resource_type="USER",
        resource_id=str(current_user.id),
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        payload={},
    )
    await db.commit()
    await db.refresh(current_user)

    return TokenResponse(
        access_token=create_access_token(current_user),
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_token=create_refresh_token(current_user),
        user=UserResponse.model_validate(current_user),
    )


@router.post("/logout-all")
async def logout_all_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Revoke all active sessions and refresh tokens across all devices."""
    current_user.token_version = (current_user.token_version or 1) + 1
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


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current_user: User = Depends(get_current_user)) -> None:
    """Stateless JWT logout; the client discards access and refresh tokens."""
    return None


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return currently authenticated user information."""
    return UserResponse.model_validate(current_user)


@router.get("/login-url", response_model=LoginUrlResponse)
async def get_login_url(
    redirect_uri: str = Query("http://localhost:3000/auth/callback"),
    auth_service: AuthService = Depends(get_auth_service),
) -> LoginUrlResponse:
    """Get Keycloak OIDC login URL."""
    url = auth_service.get_login_url(redirect_uri)
    return LoginUrlResponse(login_url=url)


@router.get("/logout-url", response_model=LogoutUrlResponse)
async def get_logout_url(
    redirect_uri: str = Query("http://localhost:3000"),
    auth_service: AuthService = Depends(get_auth_service),
) -> LogoutUrlResponse:
    """Get Keycloak logout URL."""
    url = auth_service.get_logout_url(redirect_uri)
    return LogoutUrlResponse(logout_url=url)


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
