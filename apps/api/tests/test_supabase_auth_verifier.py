"""Standalone tests for the (not-yet-default) Supabase Auth JWT verifier.

Doesn't hit a real Supabase project or network -- generates a real EC
keypair and signs test tokens with it, then monkeypatches the module's
JWKS client to hand back that keypair's public key, exactly mimicking what
a real JWKS fetch would resolve to for a token signed with that key.
"""

import time
from types import SimpleNamespace
from unittest.mock import patch

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

from app.core.config import settings
from app.domains.auth import supabase_auth

_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
_PUBLIC_KEY = _PRIVATE_KEY.public_key()


def _make_token(**overrides) -> str:
    now = int(time.time())
    claims = {
        "sub": "11111111-1111-1111-1111-111111111111",
        "email": "supabase-user@example.com",
        "aud": "authenticated",
        "role": "authenticated",
        "iss": "https://test-project.supabase.co/auth/v1",
        "iat": now,
        "exp": now + 3600,
        **overrides,
    }
    return jwt.encode(claims, _PRIVATE_KEY, algorithm="ES256")


@pytest.fixture(autouse=True)
def _fake_jwks(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://test-project.supabase.co")
    fake_client = SimpleNamespace(
        get_signing_key_from_jwt=lambda token: SimpleNamespace(key=_PUBLIC_KEY)
    )
    with patch.object(supabase_auth, "_jwks_client", fake_client):
        yield


def test_valid_token_resolves_identity():
    token = _make_token()
    identity = supabase_auth.verify_supabase_token(token)
    assert identity.user_id == "11111111-1111-1111-1111-111111111111"
    assert identity.email == "supabase-user@example.com"


def test_expired_token_rejected():
    token = _make_token(iat=int(time.time()) - 7200, exp=int(time.time()) - 3600)
    with pytest.raises(HTTPException) as exc_info:
        supabase_auth.verify_supabase_token(token)
    assert exc_info.value.status_code == 401


def test_wrong_audience_rejected():
    token = _make_token(aud="some-other-app")
    with pytest.raises(HTTPException) as exc_info:
        supabase_auth.verify_supabase_token(token)
    assert exc_info.value.status_code == 401


def test_token_signed_with_a_different_key_is_rejected():
    other_key = ec.generate_private_key(ec.SECP256R1())
    now = int(time.time())
    token = jwt.encode(
        {
            "sub": "22222222-2222-2222-2222-222222222222",
            "aud": "authenticated",
            "iat": now,
            "exp": now + 3600,
        },
        other_key,
        algorithm="ES256",
    )
    with pytest.raises(HTTPException) as exc_info:
        supabase_auth.verify_supabase_token(token)
    assert exc_info.value.status_code == 401


def test_missing_sub_claim_rejected():
    now = int(time.time())
    token = jwt.encode(
        {"aud": "authenticated", "iat": now, "exp": now + 3600}, _PRIVATE_KEY, algorithm="ES256"
    )
    with pytest.raises(HTTPException) as exc_info:
        supabase_auth.verify_supabase_token(token)
    assert exc_info.value.status_code == 401


def test_wrong_issuer_rejected():
    """A token that verifies against this project's own JWKS key but claims
    a different project's issuer URL must still be rejected -- defense in
    depth alongside the JWKS-derived-from-SUPABASE_URL signature check."""
    token = _make_token(iss="https://a-different-project.supabase.co/auth/v1")
    with pytest.raises(HTTPException) as exc_info:
        supabase_auth.verify_supabase_token(token)
    assert exc_info.value.status_code == 401


def test_unconfigured_supabase_url_returns_503(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", None)
    with patch.object(supabase_auth, "_jwks_client", None):
        with pytest.raises(HTTPException) as exc_info:
            supabase_auth.verify_supabase_token(_make_token())
    assert exc_info.value.status_code == 503


def _claims() -> dict:
    now = int(time.time())
    return {
        "sub": "11111111-1111-1111-1111-111111111111",
        "aud": "authenticated",
        "iss": "https://test-project.supabase.co/auth/v1",
        "iat": now,
        "exp": now + 3600,
    }


def test_unsigned_alg_none_token_rejected():
    """Algorithm pinning: an unsigned token must never verify."""
    token = jwt.encode(_claims(), key=None, algorithm="none")
    with pytest.raises(HTTPException) as exc_info:
        supabase_auth.verify_supabase_token(token)
    assert exc_info.value.status_code == 401


def test_hs256_token_keyed_with_the_public_key_rejected(monkeypatch):
    """Algorithm confusion: HMAC-signing with the (public) verification key must fail."""
    from cryptography.hazmat.primitives import serialization

    pem = _PUBLIC_KEY.public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    header = {"alg": "HS256", "typ": "JWT"}
    import base64
    import hashlib
    import hmac
    import json

    def b64(b: bytes) -> str:
        return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

    signing_input = f"{b64(json.dumps(header).encode())}.{b64(json.dumps(_claims()).encode())}"
    sig = hmac.new(pem, signing_input.encode(), hashlib.sha256).digest()
    token = f"{signing_input}.{b64(sig)}"
    with pytest.raises(HTTPException) as exc_info:
        supabase_auth.verify_supabase_token(token)
    assert exc_info.value.status_code == 401


@pytest.mark.parametrize("token", ["", "not-a-jwt", "a.b.c", "Bearer x.y.z"])
def test_malformed_tokens_rejected(token):
    with pytest.raises(HTTPException) as exc_info:
        supabase_auth.verify_supabase_token(token)
    assert exc_info.value.status_code == 401
