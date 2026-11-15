"""Minimal stand-in for WorkOS User Management (AuthKit), used only by the E2E suite.

The API talks to this exactly as it would to api.workos.com (WORKOS_API_URL):
Magic Auth codes, the authenticate endpoint (magic-auth code, OAuth
authorization code, refresh token), users (get, list by email, delete),
session revoke, the /user_management/authorize redirect for Google/GitHub/
Microsoft, and the client's JWKS (RS256) the API verifies access tokens with.
Access tokens carry no email, like real AuthKit tokens, so the API's
verified-email lookup is exercised too.

Every code is E2E_OTP_CODE (default 123456). OAuth "signs in" the address in
E2E_OAUTH_EMAIL, or the `login_hint` query parameter when given.

Run: python3 server.py  (env: PORT=9998, CLIENT_ID=client_e2e, ISSUER=<url>)
"""

import json
import os
import secrets
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

PORT = int(os.environ.get("PORT", "9998"))
CLIENT_ID = os.environ.get("CLIENT_ID", "client_e2e")
ISSUER = os.environ.get("ISSUER", f"http://localhost:{PORT}/user_management/{CLIENT_ID}")
OTP_CODE = os.environ.get("E2E_OTP_CODE", "123456")
OAUTH_EMAIL = os.environ.get("E2E_OAUTH_EMAIL", "oauth-member@example.com")
KID = "e2e-workos-key"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PUBLIC_JWK = {**json.loads(RSAAlgorithm.to_jwk(KEY.public_key())), "kid": KID, "alg": "RS256", "use": "sig"}

USERS: dict[str, dict] = {}  # id -> user
CODES: dict[str, str] = {}  # one-time OAuth code -> user id
REFRESH: dict[str, tuple[str, str]] = {}  # refresh token -> (user id, session id)
SESSIONS: dict[str, dict] = {}  # session id -> {user_id, status}


def _by_email(email: str) -> dict | None:
    return next((u for u in USERS.values() if u["email"] == email), None)


def _user(email: str) -> dict:
    found = _by_email(email)
    if found:
        return found
    uid = "user_" + secrets.token_hex(12).upper()
    USERS[uid] = {"object": "user", "id": uid, "email": email, "email_verified": True}
    return USERS[uid]


def _tokens(uid: str) -> dict:
    sid = "session_" + secrets.token_hex(12).upper()
    SESSIONS[sid] = {"id": sid, "user_id": uid, "status": "active"}
    return _issue(uid, sid)


def _issue(uid: str, sid: str) -> dict:
    now = int(time.time())
    access = jwt.encode(
        {"sub": uid, "sid": sid, "iss": ISSUER, "iat": now, "exp": now + 300, "jti": secrets.token_hex(8)},
        KEY, algorithm="RS256", headers={"kid": KID},
    )
    refresh = secrets.token_urlsafe(24)
    REFRESH[refresh] = (uid, sid)
    return {"access_token": access, "refresh_token": refresh, "user": USERS[uid]}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        pass

    def _send(self, status: int, body: object | None = None, headers: dict | None = None) -> None:
        payload = b"" if body is None else json.dumps(body).encode()
        self.send_response(status)
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        if body is not None:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(length) or b"{}") if length else {}

    def _authorized(self) -> bool:
        return (self.headers.get("Authorization") or "").startswith("Bearer sk_test_")

    def do_GET(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        query = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path == f"/sso/jwks/{CLIENT_ID}":
            return self._send(200, {"keys": [PUBLIC_JWK]})
        if url.path == "/user_management/authorize":
            # The real AuthKit shows the provider's consent screen; here the
            # provider "approves" at once and redirects back with a code.
            if query.get("client_id") != CLIENT_ID or query.get("provider") not in {
                "GoogleOAuth", "GitHubOAuth", "MicrosoftOAuth"
            }:
                return self._send(400, {"error": "invalid_request"})
            code = secrets.token_urlsafe(16)
            CODES[code] = _user(query.get("login_hint", OAUTH_EMAIL).lower())["id"]
            target = f"{query['redirect_uri']}?{urlencode({'code': code, 'state': query.get('state', '')})}"
            return self._send(302, None, {"Location": target})
        if not self._authorized():
            return self._send(401, {"code": "unauthorized"})
        if url.path == "/user_management/users":
            email = query.get("email", "").lower()
            data = [u for u in USERS.values() if not email or u["email"] == email]
            return self._send(200, {"data": data, "list_metadata": {}})
        parts = url.path.split("/")
        if url.path.startswith("/user_management/users/") and url.path.endswith("/sessions"):
            uid = parts[3]
            return self._send(200, {"data": [s for s in SESSIONS.values() if s["user_id"] == uid]})
        if url.path.startswith("/user_management/users/"):
            user = USERS.get(parts[3])
            return self._send(200, user) if user else self._send(404, {"code": "entity_not_found"})
        self._send(404, {"code": "not_found"})

    def do_DELETE(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if not self._authorized():
            return self._send(401, {"code": "unauthorized"})
        if path.startswith("/user_management/users/"):
            uid = path.split("/")[3]
            if USERS.pop(uid, None) is None:
                return self._send(404, {"code": "entity_not_found"})
            for sid in [s for s, v in SESSIONS.items() if v["user_id"] == uid]:
                SESSIONS[sid]["status"] = "revoked"
            return self._send(202, {})
        self._send(404, {"code": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        body = self._json()
        if path == "/user_management/authenticate":
            if body.get("client_id") != CLIENT_ID or not str(body.get("client_secret", "")).startswith("sk_test_"):
                return self._send(401, {"error": "invalid_client"})
            grant = body.get("grant_type")
            if grant == "urn:workos:oauth:grant-type:magic-auth:code":
                if body.get("code") != OTP_CODE:
                    return self._send(400, {"error": "invalid_grant", "error_description": "Invalid code"})
                return self._send(200, _tokens(_user(str(body.get("email", "")).lower())["id"]))
            if grant == "authorization_code":
                uid = CODES.pop(str(body.get("code")), None)
                if not uid:
                    return self._send(400, {"error": "invalid_grant"})
                return self._send(200, _tokens(uid))
            if grant == "refresh_token":
                found = REFRESH.pop(str(body.get("refresh_token")), None)
                if not found or SESSIONS.get(found[1], {}).get("status") != "active" or found[0] not in USERS:
                    return self._send(400, {"error": "invalid_grant"})
                return self._send(200, _issue(*found))
            return self._send(400, {"error": "unsupported_grant_type"})
        if not self._authorized():
            return self._send(401, {"code": "unauthorized"})
        if path == "/user_management/magic_auth":
            return self._send(201, {"id": "magic_auth_" + secrets.token_hex(6), "email": body.get("email")})
        if path == "/user_management/sessions/revoke":
            session = SESSIONS.get(str(body.get("session_id")))
            if not session:
                return self._send(404, {"code": "entity_not_found"})
            session["status"] = "revoked"
            return self._send(200, {})
        if path == "/user_management/users":
            if _by_email(str(body.get("email", "")).lower()):
                return self._send(409, {"code": "user_already_exists"})
            user = _user(str(body.get("email", "")).lower())
            user["email_verified"] = bool(body.get("email_verified"))
            return self._send(201, user)
        self._send(404, {"code": "not_found"})


if __name__ == "__main__":
    print(f"mock WorkOS on :{PORT} (issuer {ISSUER})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
