"""
API routes for Authentication domain.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user, get_auth_service
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.auth.schemas import (
    UserResponse,
    UserUpdate,
    AuthSyncRequest,
    LoginUrlResponse,
    LogoutUrlResponse,
)
from app.domains.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


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
    """Update current user role (e.g. during onboarding choice: ENGINEER or COMPANY)."""
    repo = UserRepository(db)
    updated_user = await repo.update(current_user, UserUpdate(role=role))
    return UserResponse.model_validate(updated_user)
