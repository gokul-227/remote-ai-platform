"""Encrypt stored GitHub tokens with a key derived from the OAuth client secret.

Rotating the client secret makes existing tokens unreadable; users simply
reconnect (the old grants also stop working once the secret is rotated).
"""

import base64

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import settings


def _fernet() -> Fernet:
    if not settings.GITHUB_CLIENT_SECRET:
        raise RuntimeError("GitHub integration is not configured")
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"rap-github-token", info=b"v1").derive(
        settings.GITHUB_CLIENT_SECRET.encode()
    )
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt(blob: str) -> str | None:
    try:
        return _fernet().decrypt(blob.encode()).decode()
    except (InvalidToken, RuntimeError):
        return None
