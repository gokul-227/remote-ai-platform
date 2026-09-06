"""
FastAPI authentication and authorization dependencies.
"""

from collections.abc import Callable

import structlog
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

logger = structlog.get_logger(__name__)

security_scheme = HTTPBearer(auto_error=False)


async def get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    repo = UserRepository(db)
    return AuthService(repo)


async def authenticate_bearer_token(token: str, db: AsyncSession) -> User:
    """Resolve a raw bearer token string to an active, non-revoked User.

    Shared by the HTTP `get_current_user` dependency below AND every
    WebSocket endpoint (which cannot use FastAPI's `Security`/`HTTPBearer`
    machinery since the token arrives as a query param, not a header).
    Respects `settings.AUTH_PROVIDER` exactly the same way in both places --
    previously the WebSocket endpoints called `AuthService.verify_token`
    directly, which only ever understands this app's own HS256 tokens. That
    meant that with AUTH_PROVIDER=supabase (the production setting -- see
    CI's E2E job), every WebSocket connection using a real Supabase-issued
    (ES256) access token would fail signature verification and get rejected
    with 4401, breaking real-time messaging/notifications outright. Fails
    closed either way: an unrecognized or invalid token never resolves to a
    user, regardless of which provider's format it fails to match.
    """
    repo = UserRepository(db)
    service = AuthService(repo)

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


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Validates bearer token and returns authenticated DB user.
    Raises 401 unconditionally if the token is missing or invalid — there is no
    DEBUG-mode fallback/mock user, regardless of settings.DEBUG.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        return await authenticate_bearer_token(token, db)
    except HTTPException:
        raise
    except AuthenticationError as e:
        # AuthenticationError messages are authored by this app's own code
        # (see app.domains.auth.service) -- e.g. "Invalid token: missing
        # subject (sub)" -- so they're safe to return to the client verbatim.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    except Exception as e:
        # Anything else here (a raw jwt/jose decode error on a malformed
        # token, a SQLAlchemy error surfaced from get_or_create_user_from_token
        # or db.refresh, ...) is NOT authored by this app and must never be
        # echoed to the client: those messages can carry SQL fragments, table/
        # column names, driver/connection details, or library-internal state.
        # Log the real exception server-side; return a generic 401 detail.
        logger.warning("Authentication failed with an unexpected error", error=str(e), exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
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
