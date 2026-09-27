"""
FastAPI authentication and authorization dependencies.
"""

from collections.abc import Callable
from datetime import UTC

import structlog
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.database import get_db
from app.core.exceptions import AuthenticationError
from app.domains.auth import supabase_auth
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.auth.service import AuthService
from app.services.ai.metering import set_ai_actor

logger = structlog.get_logger(__name__)

security_scheme = HTTPBearer(auto_error=False)


async def get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    repo = UserRepository(db)
    return AuthService(repo)


async def authenticate_bearer_token(token: str, db: AsyncSession) -> User:
    """Resolve a raw Supabase access token to an active, non-revoked User.

    Shared by the HTTP `get_current_user` dependency and every WebSocket
    endpoint (where the token arrives as a query parameter). Fails closed: a
    token that doesn't verify never resolves to a user.
    """
    # Verification may fetch the JWKS over the network (synchronously); keep
    # that off the event loop so one slow fetch can't stall every request.
    identity = await run_in_threadpool(supabase_auth.verify_supabase_token, token)
    repo = UserRepository(db)
    user = await AuthService(repo).get_or_create_user(identity)
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    if _session_revoked(user, identity.issued_at):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Ensure all server-default/onupdate columns are loaded within the async context
    # to avoid MissingGreenlet during Pydantic serialization.
    await repo.db.refresh(user)
    # Attribute any AI calls made while serving this request to this user.
    set_ai_actor(user.id, repo.db, unlimited=user.role == UserRole.ADMIN)
    return user


def _session_revoked(user: User, issued_at: int | None) -> bool:
    """True if the token predates the user's last sign-out-everywhere."""
    revoked_at = user.sessions_revoked_at
    if revoked_at is None:
        return False
    if issued_at is None:
        # Cannot prove the token postdates the revocation.
        return True
    if revoked_at.tzinfo is None:  # SQLite in tests drops the offset
        revoked_at = revoked_at.replace(tzinfo=UTC)
    # iat has whole-second precision; a token minted in the same second as
    # the revocation is treated as revoked.
    return issued_at <= int(revoked_at.timestamp())


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
