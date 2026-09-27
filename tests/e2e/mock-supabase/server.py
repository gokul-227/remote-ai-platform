"""Minimal stand-in for Supabase Auth, used only by the E2E suite.

The browser app (supabase-js) and the API talk to this exactly as they would
to Supabase: email-code sign-in (/otp, /verify), session refresh, sign-out
(local and global), /user, and the JWKS the API uses to verify access tokens
(ES256). Nothing here is used outside tests; it lets the real frontend and
backend run end to end in CI without a real Supabase project, real email, or
any production account.

Every code sent is E2E_OTP_CODE (default 123456).

Run: python3 server.py  (env: PORT=9999, ISSUER=<SUPABASE_URL>/auth/v1)
"""

import json
import os
import secrets
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from jwt.algorithms import ECAlgorithm

PORT = int(os.environ.get("PORT", "9999"))
ISSUER = os.environ.get("ISSUER", f"http://localhost:{PORT}/auth/v1")
OTP_CODE = os.environ.get("E2E_OTP_CODE", "123456")
KID = "e2e-key"
KEY = ec.generate_private_key(ec.SECP256R1())
PUBLIC_JWK = {**json.loads(ECAlgorithm.to_jwk(KEY.public_key())), "kid": KID, "alg": "ES256", "use": "sig"}

USERS: dict[str, dict] = {}  # email -> user
REFRESH: dict[str, str] = {}  # refresh token -> email


def _user(email: str, metadata: dict | None = None) -> dict:
    if email not in USERS:
        USERS[email] = {
            "id": str(uuid.uuid4()),
            "aud": "authenticated",
            "role": "authenticated",
            "email": email,
            "email_confirmed_at": "2026-01-01T00:00:00Z",
            "user_metadata": metadata or {},
            "app_metadata": {"provider": "email"},
            "created_at": "2026-01-01T00:00:00Z",
        }
    return USERS[email]


def _session(email: str) -> dict:
    user = USERS[email]
    now = int(time.time())
    access = jwt.encode(
        {"sub": user["id"], "email": email, "aud": "authenticated", "role": "authenticated",
         "iss": ISSUER, "iat": now, "exp": now + 3600, "session_id": str(uuid.uuid4())},
        KEY, algorithm="ES256", headers={"kid": KID},
    )
    refresh = secrets.token_urlsafe(24)
    REFRESH[refresh] = email
    return {"access_token": access, "token_type": "bearer", "expires_in": 3600,
            "expires_at": now + 3600, "refresh_token": refresh, "user": user}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:  # keep CI logs readable
        pass

    def _send(self, status: int, body: object | None = None) -> None:
        payload = b"" if body is None else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        if body is not None:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(length) or b"{}") if length else {}

    def _bearer_email(self) -> str | None:
        token = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        try:
            claims = jwt.decode(token, KEY.public_key(), algorithms=["ES256"], audience="authenticated")
        except jwt.PyJWTError:
            return None
        return claims.get("email")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(204)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/auth/v1/.well-known/jwks.json":
            return self._send(200, {"keys": [PUBLIC_JWK]})
        if path == "/auth/v1/health":
            return self._send(200, {"name": "mock-gotrue"})
        if path == "/auth/v1/user":
            email = self._bearer_email()
            return self._send(200, USERS[email]) if email in USERS else self._send(401, {"msg": "invalid JWT"})
        self._send(404, {"msg": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        query = parse_qs(url.query)
        body = self._json()
        if url.path == "/auth/v1/otp":
            email = (body.get("email") or "").lower()
            if email not in USERS and not body.get("create_user", True):
                return self._send(422, {"code": "otp_disabled", "msg": "Signups not allowed for otp"})
            _user(email, body.get("data"))
            return self._send(200, {})
        if url.path == "/auth/v1/verify":
            email = (body.get("email") or "").lower()
            if email not in USERS or body.get("token") != OTP_CODE:
                return self._send(403, {"code": "otp_expired", "msg": "Token has expired or is invalid"})
            return self._send(200, _session(email))
        if url.path == "/auth/v1/token" and query.get("grant_type") == ["refresh_token"]:
            email = REFRESH.pop(body.get("refresh_token", ""), None)
            if not email:
                return self._send(400, {"code": "refresh_token_not_found", "msg": "Invalid Refresh Token"})
            return self._send(200, _session(email))
        if url.path == "/auth/v1/logout":
            email = self._bearer_email()
            if query.get("scope") == ["global"] and email:
                for token in [t for t, e in REFRESH.items() if e == email]:
                    REFRESH.pop(token, None)
            return self._send(204)
        self._send(404, {"msg": "not found"})


if __name__ == "__main__":
    print(f"mock Supabase Auth on :{PORT} (issuer {ISSUER})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
