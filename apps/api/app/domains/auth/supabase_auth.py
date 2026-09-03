"""Supabase Auth JWT verification.

Not yet the default identity path (see settings.AUTH_PROVIDER) -- built and
tested standalone so it can be validated against a real Supabase project
before the existing self-issued-JWT auth system is retired.

Supabase Auth signs tokens asymmetrically (ES256 by default on new/rotated
projects) and publishes the verification keys at a JWKS endpoint, so this
backend verifies tokens purely from the public key -- it never holds a
Supabase secret and never calls back into Supabase on the request path
(the JWKS client caches keys in-process).
"""

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
        )
    return _jwks_client


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
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256", "EdDSA"],
            audience=settings.SUPABASE_JWT_AUDIENCE,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return SupabaseIdentity(user_id=sub, email=payload.get("email"))
