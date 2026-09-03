"""
FastAPI authentication and authorization dependencies.
"""

from collections.abc import Callable

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import AuthenticationError
from app.domains.auth import supabase_auth
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.auth.schemas import TokenPayload
from app.domains.auth.service import AuthService

security_scheme = HTTPBearer(auto_error=False)


async def get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    repo = UserRepository(db)
    return AuthService(repo)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Validates bearer token and returns authenticated DB user.
    Raises 401 unconditionally if the token is missing or invalid — there is no
    DEBUG-mode fallback/mock user, regardless of settings.DEBUG.
    """
    repo = UserRepository(db)
    service = AuthService(repo)

    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        if settings.AUTH_PROVIDER == "supabase":
            identity = supabase_auth.verify_supabase_token(token)
            # Supabase's own `role` JWT claim is the Postgres RLS role, not
            # this app's business role -- role is decided by this backend
            # (defaulted on first sight, changed only through its own admin
            # endpoints), never read off the identity provider's token.
            payload = TokenPayload(sub=identity.user_id, email=identity.email, roles=[])
        else:
            payload = await service.verify_token(token)
        user = await service.get_or_create_user_from_token(payload)
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive",
            )
        if payload.v is not None and user.token_version > payload.v:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has been revoked. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Ensure all server-default/onupdate columns are loaded within the async context
        # to avoid MissingGreenlet during Pydantic serialization.
        await repo.db.refresh(user)
        return user
    except HTTPException:
        raise
    except (AuthenticationError, Exception) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Returns User if valid bearer token present, else None."""
    if not credentials or not credentials.credentials:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None


def require_role(*allowed_roles: UserRole) -> Callable:
    """
    Factory for role-based access control dependency.
    Example: Depends(require_role(UserRole.COMPANY, UserRole.ADMIN))
    """

    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User role '{current_user.role.value}' is not permitted to access this resource. Required: {[r.value for r in allowed_roles]}",
            )
        return current_user

    return role_checker
