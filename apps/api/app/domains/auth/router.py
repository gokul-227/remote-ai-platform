import uuid
from typing import Optional
from datetime import datetime, timedelta, timezone
from jose import jwt
from passlib.context import CryptContext
from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user, get_auth_service
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.auth.schemas import (
    UserResponse,
    UserCreate,
    UserUpdate,
    AuthSyncRequest,
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    LoginUrlResponse,
    LogoutUrlResponse,
    RefreshTokenRequest,
)
from app.domains.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def create_token(user: User, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(user.keycloak_id or user.id),
        "email": user.email,
        "name": user.full_name,
        "roles": [user.role.value],
        "type": token_type,
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
    password_val: str | None
    if content_type.startswith("application/json"):
        payload = await request.json()
        data = LoginRequest.model_validate(payload)
        email_val = data.email
        password_val = data.password
    else:
        form = await request.form()
        email_val = form.get("username") or form.get("email")
        password_val = form.get("password")
    if not email_val:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email/username is required",
        )

    repo = UserRepository(db)
    user = await repo.get_by_email(email_val)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.password_hash or not password_val or not pwd_context.verify(password_val, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

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
        claims = jwt.decode(body.refresh_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if claims.get("type") != "refresh":
            raise ValueError("not a refresh token")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc
    repo = UserRepository(db)
    user = await repo.get_by_keycloak_id(claims.get("sub", ""))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    return TokenResponse(
        access_token=create_access_token(user),
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_token=create_refresh_token(user),
        user=UserResponse.model_validate(user),
    )


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


@router.post("/sync", response_model=UserResponse)
async def sync_user(
    sync_req: AuthSyncRequest,
    auth_service: AuthService = Depends(get_auth_service),
) -> UserResponse:
    """Sync Keycloak user data into database."""
    user = await auth_service.sync_user(sync_req)
    return UserResponse.model_validate(user)


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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot self-assign admin role")
    repo = UserRepository(db)
    updated_user = await repo.update(current_user, UserUpdate(role=role))
    return UserResponse.model_validate(updated_user)
