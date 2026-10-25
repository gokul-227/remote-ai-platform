"""
GitHub domain FastAPI router — connect your own GitHub account and pick commits.

OAuth web flow with a one-time state bound to the signed-in user. Only GitHub's
fixed hosts are called. "public" access requests no scopes (public data only);
"private" requests `repo` so deliverables can reference private repositories.
"""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.github.crypto import decrypt, encrypt
from app.domains.github.models import GithubConnection, GithubOAuthState

router = APIRouter(prefix="/github", tags=["GitHub"])

AUTHORIZE = "https://github.com/login/oauth/authorize"
TOKEN = "https://github.com/login/oauth/access_token"
API = "https://api.github.com"
TIMEOUT = httpx.Timeout(10.0)
STATE_TTL = timedelta(minutes=10)


def _configured() -> None:
    if not (settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "GitHub connection isn't set up on this server")


def _callback_url(request: Request) -> str:
    if settings.GITHUB_CALLBACK_URL:
        return settings.GITHUB_CALLBACK_URL
    scheme = "http" if request.url.hostname in {"localhost", "127.0.0.1", "testserver"} else "https"
    return f"{scheme}://{request.url.netloc}/api/v1/github/callback"


def _app_url(result: str) -> str:
    return f"{settings.APP_URL.rstrip('/')}/#settings?github={result}"


async def _gh(method: str, url: str, token: str | None = None, **kw: Any) -> httpx.Response:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "remote-ai-platform"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as client:
        return await client.request(method, url, headers=headers, **kw)


@router.get("/status")
async def github_status(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    conn = await db.scalar(select(GithubConnection).where(GithubConnection.user_id == current_user.id))
    return {
        "configured": bool(settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET),
        "connected": conn is not None,
        "login": conn.github_login if conn else None,
        "private_access": bool(conn and "repo" in conn.scopes.split(",")),
    }


@router.post("/connect")
async def github_connect(
    request: Request,
    access: Literal["public", "private"] = "public",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    _configured()
    await db.execute(delete(GithubOAuthState).where(GithubOAuthState.user_id == current_user.id))
    state = secrets.token_urlsafe(32)
    db.add(GithubOAuthState(state=state, user_id=current_user.id, expires_at=datetime.now(UTC) + STATE_TTL))
    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": _callback_url(request),
        "state": state,
        "scope": "repo" if access == "private" else "",
        "allow_signup": "false",
    }
    return {"authorize_url": f"{AUTHORIZE}?{urlencode(params)}"}


@router.get("/callback", include_in_schema=False)
async def github_callback(
    request: Request, code: str | None = None, state: str | None = None, db: AsyncSession = Depends(get_db)
) -> RedirectResponse:
    """GitHub redirects the browser here; the state identifies (and authorises) the user."""
    if not code or not state:
        return RedirectResponse(_app_url("cancelled"))
    pending = await db.get(GithubOAuthState, state)
    if pending is None:
        return RedirectResponse(_app_url("expired"))
    await db.delete(pending)
    expires = pending.expires_at if pending.expires_at.tzinfo else pending.expires_at.replace(tzinfo=UTC)
    if expires < datetime.now(UTC) or not (settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET):
        await db.commit()
        return RedirectResponse(_app_url("expired"))
    try:
        res = await _gh("POST", TOKEN, data={
            "client_id": settings.GITHUB_CLIENT_ID, "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code, "redirect_uri": _callback_url(request),
        })
        token = res.json().get("access_token") if res.status_code == 200 else None
        scopes = res.json().get("scope", "") if res.status_code == 200 else ""
        me = await _gh("GET", f"{API}/user", token) if token else None
    except (httpx.HTTPError, ValueError):
        token, me = None, None
    if not token or me is None or me.status_code != 200:
        await db.commit()
        return RedirectResponse(_app_url("failed"))
    login = str(me.json().get("login", ""))[:100]
    conn = await db.scalar(select(GithubConnection).where(GithubConnection.user_id == pending.user_id))
    if conn is None:
        db.add(GithubConnection(user_id=pending.user_id, github_login=login, scopes=scopes, token_encrypted=encrypt(token)))
    else:
        conn.github_login, conn.scopes, conn.token_encrypted = login, scopes, encrypt(token)
    await db.commit()
    return RedirectResponse(_app_url("connected"))


async def _token(db: AsyncSession, user_id: uuid.UUID) -> str:
    conn = await db.scalar(select(GithubConnection).where(GithubConnection.user_id == user_id))
    token = decrypt(conn.token_encrypted) if conn else None
    if not token:
        raise HTTPException(status.HTTP_409_CONFLICT, "Connect your GitHub account first")
    return token


async def user_token(db: AsyncSession, user_id: uuid.UUID) -> str | None:
    """The user's GitHub token, if connected (used to check private-repo commits)."""
    conn = await db.scalar(select(GithubConnection).where(GithubConnection.user_id == user_id))
    return decrypt(conn.token_encrypted) if conn else None


@router.delete("/connection")
async def github_disconnect(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, bool]:
    conn = await db.scalar(select(GithubConnection).where(GithubConnection.user_id == current_user.id))
    if conn is not None:
        token = decrypt(conn.token_encrypted)
        if token and settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET:
            # Revoke the grant on GitHub too, so the token stops working everywhere.
            try:
                async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                    await client.request(
                        "DELETE", f"{API}/applications/{settings.GITHUB_CLIENT_ID}/grant",
                        auth=(settings.GITHUB_CLIENT_ID, settings.GITHUB_CLIENT_SECRET),
                        json={"access_token": token},
                        headers={"Accept": "application/vnd.github+json", "User-Agent": "remote-ai-platform"},
                    )
            except httpx.HTTPError:
                pass
        await db.delete(conn)
    return {"connected": False}


@router.get("/repos")
async def my_repos(
    page: int = Query(1, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    token = await _token(db, current_user.id)
    res = await _gh("GET", f"{API}/user/repos", token, params={"per_page": 50, "page": page, "sort": "pushed"})
    if res.status_code == 401:
        raise HTTPException(status.HTTP_409_CONFLICT, "Your GitHub connection expired; reconnect it")
    if res.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "GitHub didn't answer; try again")
    return [
        {"full_name": r["full_name"], "html_url": r["html_url"], "private": r["private"], "default_branch": r["default_branch"]}
        for r in res.json()
    ]


@router.get("/repos/{owner}/{repo}/commits")
async def repo_commits(
    owner: str, repo: str, branch: str | None = Query(None, max_length=255),
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    if not all(c.isalnum() or c in "-_." for c in owner + repo):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid repository name")
    token = await _token(db, current_user.id)
    params: dict[str, Any] = {"per_page": 20}
    if branch:
        params["sha"] = branch
    res = await _gh("GET", f"{API}/repos/{owner}/{repo}/commits", token, params=params)
    if res.status_code != 200:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository or branch not found")
    return [
        {"sha": c["sha"], "message": (c["commit"]["message"] or "").split("\n")[0][:200], "date": c["commit"]["author"]["date"]}
        for c in res.json()
    ]
