"""WorkOS AuthKit sign-in, proxied so the app keeps its own sign-in screens.

The browser never holds the WorkOS API key: it asks this API to email a code,
verify it, start an OAuth sign-in, exchange the OAuth callback code, refresh a
session or end one. Every token returned is minted by WorkOS; this API still
never issues tokens. The access token is then used like a Supabase one
(`Authorization: Bearer`), and `/auth/me` resolves the account.

Only active when WORKOS_CLIENT_ID and WORKOS_API_KEY are set; `GET /config`
tells the web and admin apps which provider to use (AUTH_PRIMARY_PROVIDER).
"""

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.domains.auth import supabase_auth, workos_client
from app.domains.auth.dependencies import security_scheme
from app.domains.auth.repository import UserRepository

router = APIRouter(prefix="/auth/workos", tags=["Authentication"])
logger = get_logger("auth.workos")

CALLBACK_PATH = "/auth/callback"


class ProviderConfig(BaseModel):
    primary: str
    workos_client_id: str | None = None
    oauth_providers: list[str] = []
    accept_supabase: bool


class EmailIn(BaseModel):
    email: EmailStr
    # Staff console: send only to an address that already has an account, so
    # it never creates users (Supabase's shouldCreateUser=false).
    existing_only: bool = False


class VerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12, pattern=r"^[0-9A-Za-z]+$")


class AuthorizeIn(BaseModel):
    provider: str
    redirect_uri: str = Field(max_length=512)
    state: str = Field(min_length=16, max_length=128, pattern=r"^[A-Za-z0-9_\-]+$")
    code_challenge: str | None = Field(
        default=None, min_length=43, max_length=128, pattern=r"^[A-Za-z0-9_\-]+$"
    )


class CallbackIn(BaseModel):
    code: str = Field(min_length=8, max_length=256, pattern=r"^[A-Za-z0-9_\-]+$")
    code_verifier: str | None = Field(
        default=None, min_length=43, max_length=128, pattern=r"^[A-Za-z0-9_\-.~]+$"
    )


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=8, max_length=512)


class LogoutIn(BaseModel):
    everywhere: bool = False


class TokensOut(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"


def _require_workos() -> None:
    if not workos_client.is_configured():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="This sign-in method is not enabled"
        )


def _allowed_redirect(uri: str) -> bool:
    """Only this app's own origins' callback page (as in CORS_ORIGINS)."""
    parsed = urlparse(uri)
    if parsed.query or parsed.fragment or parsed.path != CALLBACK_PATH:
        return False
    origin = f"{parsed.scheme}://{parsed.netloc}"
    return origin in settings.CORS_ORIGINS and parsed.scheme in {"https", "http"}


def _code_error(exc: workos_client.WorkOSError) -> HTTPException:
    if exc.status in (400, 401, 403, 404, 422):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That code is wrong or has expired. Request a new one and try again.",
        )
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Sign-in is temporarily unavailable. Please try again shortly.",
    )


@router.get("/config", response_model=ProviderConfig)
async def provider_config() -> ProviderConfig:
    """Which sign-in provider the apps should use. Public; no secrets."""
    workos = workos_client.is_configured()
    return ProviderConfig(
        primary=settings.auth_primary_provider if workos else "supabase",
        workos_client_id=settings.WORKOS_CLIENT_ID or None,
        oauth_providers=workos_client.enabled_providers() if workos else [],
        accept_supabase=settings.AUTH_ACCEPT_SUPABASE,
    )


@router.post("/magic-auth/send", status_code=status.HTTP_204_NO_CONTENT)
async def send_code(
    body: EmailIn,
    _: None = Depends(_require_workos),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Email a one-time sign-in code. Same answer whether or not an account exists."""
    email = str(body.email).strip().lower()
    if body.existing_only and await UserRepository(db).get_by_email(email) is None:
        return None
    try:
        await workos_client.send_magic_auth_code(email)
    except workos_client.WorkOSError as exc:
        if exc.status >= 500 or exc.status == 429:
            raise _code_error(exc) from exc
        # Disabled method, blocked domain, ...: log and answer as if sent, so
        # this endpoint never reveals which addresses have accounts.
        logger.warning("Magic auth send refused", status=exc.status, code=exc.code)


@router.post("/magic-auth/verify", response_model=TokensOut)
async def verify_code(body: VerifyIn, _: None = Depends(_require_workos)) -> TokensOut:
    try:
        tokens = await workos_client.verify_magic_auth_code(
            str(body.email).strip().lower(), body.code
        )
    except workos_client.WorkOSError as exc:
        raise _code_error(exc) from exc
    return TokensOut(**tokens)


@router.post("/authorize")
async def authorize(body: AuthorizeIn, _: None = Depends(_require_workos)) -> dict[str, str]:
    """The WorkOS URL that starts a Google/GitHub/Microsoft sign-in."""
    if body.provider not in workos_client.enabled_providers():
        raise HTTPException(status_code=422, detail="Unknown sign-in provider")
    if not _allowed_redirect(body.redirect_uri):
        raise HTTPException(status_code=422, detail="redirect_uri is not allowed")
    url = workos_client.authorization_url(
        body.provider, body.redirect_uri, body.state, body.code_challenge
    )
    return {"url": url}


@router.post("/callback", response_model=TokensOut)
async def oauth_callback(body: CallbackIn, _: None = Depends(_require_workos)) -> TokensOut:
    try:
        tokens = await workos_client.exchange_code(body.code, body.code_verifier)
    except workos_client.WorkOSError as exc:
        if exc.status < 500:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sign-in was cancelled or didn't complete. Choose another method or try again.",
            ) from exc
        raise _code_error(exc) from exc
    return TokensOut(**tokens)


@router.post("/refresh", response_model=TokensOut)
async def refresh_session(body: RefreshIn, _: None = Depends(_require_workos)) -> TokensOut:
    try:
        tokens = await workos_client.refresh(body.refresh_token)
    except workos_client.WorkOSError as exc:
        if exc.status < 500:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your session has ended. Please sign in again.",
            ) from exc
        raise _code_error(exc) from exc
    return TokensOut(**tokens)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    body: LogoutIn,
    credentials: HTTPAuthorizationCredentials | None = Security(security_scheme),
    _: None = Depends(_require_workos),
) -> None:
    """End this WorkOS session (or every session of the user) so refresh stops working.

    Always 204: a client whose access token has lapsed just drops its refresh
    token locally (it should refresh first to revoke server-side), and WorkOS
    sessions also expire on their own.
    """
    if not credentials or not credentials.credentials:
        return None
    try:
        identity = await run_in_threadpool(
            supabase_auth.verify_access_token, credentials.credentials
        )
    except HTTPException:
        return None
    if identity.provider != "workos":
        return None
    try:
        if body.everywhere:
            await workos_client.revoke_all_sessions(identity.user_id)
        elif identity.session_id:
            await workos_client.revoke_session(identity.session_id)
    except Exception as exc:  # noqa: BLE001 - sign-out on this device still succeeds
        logger.warning("WorkOS session revoke failed", error=type(exc).__name__)
    return None
