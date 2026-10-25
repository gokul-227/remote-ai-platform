"""
In-app browser — loads public web pages for signed-in users inside the product.

Most sites refuse to be framed (X-Frame-Options / frame-ancestors), so the API
fetches the page and serves it back with those headers dropped. Safety rules:
- a signed, short-lived token binds each view to the user and URL that asked for it;
- only public http(s) hosts are fetched, re-checked on every redirect hop and
  after DNS resolution (no SSRF into private networks);
- responses are capped in size and time, and always served with a CSP sandbox so
  the page runs in an opaque origin and can never read this API's cookies or storage.
Sites that need you to sign in with them (Google, Facebook, banks) won't work here;
the frontend offers "Open in new tab" for those.
"""

import asyncio
import base64
import hashlib
import hmac
import ipaddress
import json
import secrets
import socket
import time
from urllib.parse import urljoin, urlsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core.config import settings
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User

router = APIRouter(prefix="/browser", tags=["Browser"])

TOKEN_TTL = 600
MAX_BYTES = 3 * 1024 * 1024
MAX_REDIRECTS = 5
TIMEOUT = httpx.Timeout(10.0)
# One API instance on the free tier: a per-process key is enough, and a restart
# only means the viewer asks for a fresh token.
_KEY = secrets.token_bytes(32)
USER_AGENT = "Mozilla/5.0 (compatible; RemoteAIPlatformBrowser/1.0; +https://remoteaiplatform.com)"
SANDBOX = "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
# Keeps link clicks inside the in-app browser: the sandboxed page tells the
# parent window where to go instead of navigating itself.
NAV_SCRIPT = (
    "<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');"
    "if(!a||a.target==='_blank')return;var h=a.href;if(!/^https?:/.test(h))return;e.preventDefault();"
    "parent.postMessage({type:'rap-browser-nav',url:h},'*');},true);</script>"
)


class ViewRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


class ViewToken(BaseModel):
    url: str
    view_path: str
    expires_in: int


def _normalize(raw: str) -> str:
    url = raw.strip()
    if "://" not in url:
        url = f"https://{url}"
    parts = urlsplit(url)
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Enter an http:// or https:// address"
        )
    if parts.username or parts.password:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Addresses with credentials aren't allowed"
        )
    return url


async def _resolve(host: str) -> list[str]:
    infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return [str(info[4][0]) for info in infos]


async def _assert_public(url: str) -> None:
    host = (urlsplit(url).hostname or "").lower()
    if not host or host == "localhost" or host.endswith((".localhost", ".internal", ".local")):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Only public websites can be opened"
        )
    try:
        addrs = await _resolve(host)
    except OSError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "That website couldn't be found") from exc
    for addr in addrs:
        if not ipaddress.ip_address(addr).is_global:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "Only public websites can be opened"
            )


def _sign(payload: dict) -> str:
    body = (
        base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode())
        .decode()
        .rstrip("=")
    )
    mac = hmac.new(_KEY, body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{mac}"


def _verify(token: str) -> dict:
    body, _, mac = token.partition(".")
    good = hmac.new(_KEY, body.encode(), hashlib.sha256).hexdigest()
    if not mac or not hmac.compare_digest(mac, good):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "This page link has expired. Reload it in the browser."
        )
    payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    if payload.get("exp", 0) < time.time():
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "This page link has expired. Reload it in the browser."
        )
    return payload


@router.post("/views", response_model=ViewToken)
async def create_view(body: ViewRequest, user: User = Depends(get_current_user)) -> ViewToken:
    url = _normalize(body.url)
    await _assert_public(url)
    token = _sign({"u": url, "sub": str(user.id), "exp": int(time.time()) + TOKEN_TTL})
    return ViewToken(url=url, view_path=f"/api/v1/browser/view?t={token}", expires_in=TOKEN_TTL)


async def _fetch(url: str) -> tuple[httpx.Response, bytes, str]:
    async with httpx.AsyncClient(
        timeout=TIMEOUT, follow_redirects=False, headers={"User-Agent": USER_AGENT}
    ) as http:
        for _ in range(MAX_REDIRECTS + 1):
            await _assert_public(url)
            async with http.stream("GET", url) as resp:
                if resp.is_redirect and resp.headers.get("location"):
                    url = _normalize(urljoin(url, resp.headers["location"]))
                    continue
                chunks: list[bytes] = []
                size = 0
                async for chunk in resp.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise HTTPException(
                            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            "That page is too large to show here",
                        )
                    chunks.append(chunk)
                return resp, b"".join(chunks), url
    raise HTTPException(status.HTTP_502_BAD_GATEWAY, "That website redirected too many times")


def _frame_ancestors() -> str:
    origins = [o for o in settings.CORS_ORIGINS if o.startswith(("https://", "http://"))]
    return " ".join(origins) or "'self'"


@router.get("/view", include_in_schema=False)
async def view(t: str = Query(min_length=10, max_length=8192)) -> Response:
    payload = _verify(t)
    try:
        resp, data, final = await _fetch(payload["u"])
    except httpx.HTTPError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "That website didn't respond") from exc
    ctype = resp.headers.get("content-type", "application/octet-stream")
    if "text/html" in ctype:
        charset = resp.charset_encoding or "utf-8"
        html = data.decode(charset, errors="replace")
        head = f'<base href="{final.replace(chr(34), "%22")}">{NAV_SCRIPT}'
        lower = html[:4096].lower()
        idx = lower.find("<head")
        if idx >= 0:
            end = html.find(">", idx) + 1
            html = html[:end] + head + html[end:]
        else:
            html = head + html
        data = html.encode(charset, errors="replace")
    return Response(
        content=data,
        status_code=resp.status_code if resp.status_code < 500 else 502,
        media_type=ctype,
        headers={
            "Content-Security-Policy": f"{SANDBOX}; frame-ancestors {_frame_ancestors()}",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Cache-Control": "private, max-age=60",
            "X-Final-Url": final,
        },
    )
