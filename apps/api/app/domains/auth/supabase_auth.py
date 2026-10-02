"""Supabase Auth JWT verification.

The only identity path: every API request and WebSocket connection is
authenticated by verifying a Supabase-issued access token.

Supabase Auth signs tokens asymmetrically (ES256 by default on new/rotated
projects) and publishes the verification keys at a JWKS endpoint, so this
backend verifies tokens purely from the public key -- it never holds a
Supabase secret and never calls back into Supabase on the request path
(the JWKS client caches keys in-process).
"""

import time
from dataclasses import dataclass

import jwt
from fastapi import HTTPException, status
from jwt import PyJWKClient

from app.core.config import settings

_jwks_client: PyJWKClient | None = None


@dataclass(frozen=True)
class SupabaseIdentity:
    user_id: str
    email: str | None
    issued_at: int | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        if not settings.SUPABASE_JWKS_URL:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase auth is not configured",
            )
        _jwks_client = PyJWKClient(
            settings.SUPABASE_JWKS_URL,
            cache_keys=True,
            lifespan=settings.SUPABASE_JWKS_CACHE_SECONDS,
            # A slow Supabase must not hold a request (or thread) for 30 s.
            timeout=5,
        )
    return _jwks_client


# PyJWKClient refetches the key set whenever a token names a key id it
# hasn't seen, so made-up `kid`s would let anyone force an outbound fetch
# per request. Allow one such refresh per interval (enough for a real key
# rotation) and reject other unknown ids from the cached set.
UNKNOWN_KID_REFRESH_SECONDS = 60
_last_unknown_kid_refresh = 0.0


def _signing_key(token: str):  # noqa: ANN202 - PyJWK
    global _last_unknown_kid_refresh
    client = _get_jwks_client()
    kid = jwt.get_unverified_header(token).get("kid")
    if kid is not None:
        known = {k.key_id for k in client.get_signing_keys()}
        if kid not in known:
            now = time.monotonic()
            if now - _last_unknown_kid_refresh < UNKNOWN_KID_REFRESH_SECONDS:
                raise jwt.InvalidTokenError("Unknown signing key")
            _last_unknown_kid_refresh = now
    return client.get_signing_key_from_jwt(token)


def verify_supabase_token(token: str) -> SupabaseIdentity:
    """Verify a Supabase Auth access token and return the caller's identity.

    Deliberately does not read a business `role` claim from the token --
    Supabase's own `role` claim is the Postgres/RLS role (anon/authenticated/
    service_role), not this app's ENGINEER/COMPANY/ADMIN role, and metadata
    claims are either client-editable (user_metadata) or a second source of
    truth to keep in sync (app_metadata). This app's role stays exclusively
    in its own `users` table, looked up by the verified user_id.
    """
    try:
        signing_key = _signing_key(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256", "EdDSA"],
            audience=settings.SUPABASE_JWT_AUDIENCE,
            # Belt-and-suspenders: the signing key itself is already fetched
            # from *this* project's own JWKS endpoint (derived from
            # SUPABASE_URL), so a token from a different Supabase project
            # would already fail signature verification above. Checking
            # `iss` too costs nothing and guards against any future JWKS
            # client change (e.g. a shared/cached client across projects)
            # that might otherwise accept a same-algorithm token signed by
            # a different Supabase project.
            issuer=(
                f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1" if settings.SUPABASE_URL else None
            ),
            # PyJWT validates exp/iat/aud only when present; a token without
            # an expiry would never expire, so these claims are mandatory.
            options={
                "verify_iss": bool(settings.SUPABASE_URL),
                "require": ["exp", "iat", "sub", "aud"] + (["iss"] if settings.SUPABASE_URL else []),
            },
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return SupabaseIdentity(user_id=sub, email=payload.get("email"), issued_at=payload.get("iat"))
