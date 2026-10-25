"""GitHub connection: OAuth state binding, encrypted token, repo/commit listing, disconnect. No network."""

import uuid
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domains.github.models import GithubConnection


@pytest.fixture
def github(monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "cid")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "test-secret")
    monkeypatch.setattr(settings, "APP_URL", "https://app.example")
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(f"{request.method} {request.url.host}{request.url.path}")
        if request.url.path == "/login/oauth/access_token":
            return httpx.Response(200, json={"access_token": "gho_secret", "scope": "repo"})
        if request.url.path == "/user":
            assert request.headers["Authorization"] == "Bearer gho_secret"
            return httpx.Response(200, json={"login": "octo"})
        if request.url.path == "/user/repos":
            return httpx.Response(200, json=[{"full_name": "octo/app", "html_url": "https://github.com/octo/app", "private": True, "default_branch": "main"}])
        if request.url.path.endswith("/commits"):
            return httpx.Response(200, json=[{"sha": "a" * 40, "commit": {"message": "Ship it\n\nbody", "author": {"date": "2030-01-01T00:00:00Z"}}}])
        if request.method == "DELETE":
            return httpx.Response(204)
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real = httpx.AsyncClient
    import app.domains.github.router as r

    monkeypatch.setattr(r.httpx, "AsyncClient", lambda **kw: real(transport=transport, **kw))
    return calls


async def _user(client: AsyncClient):
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": f"gh_{uuid.uuid4().hex[:8]}@test.com", "password": "Password123!", "full_name": "G", "role": "ENGINEER"},
    )
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.mark.asyncio
async def test_unconfigured_server_says_so(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "")
    h = await _user(client)
    assert (await client.get("/api/v1/github/status", headers=h)).json()["configured"] is False
    assert (await client.post("/api/v1/github/connect", headers=h)).status_code == 503


@pytest.mark.asyncio
async def test_connect_flow_and_isolation(client: AsyncClient, db: AsyncSession, github):
    h = await _user(client)
    other = await _user(client)
    url = (await client.post("/api/v1/github/connect?access=private", headers=h)).json()["authorize_url"]
    q = parse_qs(urlsplit(url).query)
    assert q["scope"] == ["repo"]
    assert q["redirect_uri"] == ["http://testserver/api/v1/github/callback"]

    # A forged or replayed state never connects anyone.
    bad = await client.get("/api/v1/github/callback", params={"code": "x", "state": "forged"})
    assert bad.headers["location"].endswith("github=expired")
    ok = await client.get("/api/v1/github/callback", params={"code": "c", "state": q["state"][0]})
    assert ok.headers["location"] == "https://app.example/#settings?github=connected"
    replay = await client.get("/api/v1/github/callback", params={"code": "c", "state": q["state"][0]})
    assert replay.headers["location"].endswith("github=expired")

    status_ = (await client.get("/api/v1/github/status", headers=h)).json()
    assert status_ == {"configured": True, "connected": True, "login": "octo", "private_access": True}
    row = (await db.execute(select(GithubConnection))).scalar_one()
    assert "gho_secret" not in row.token_encrypted

    assert (await client.get("/api/v1/github/repos", headers=h)).json()[0]["full_name"] == "octo/app"
    commits = (await client.get("/api/v1/github/repos/octo/app/commits", headers=h)).json()
    assert commits[0]["message"] == "Ship it"
    assert (await client.get("/api/v1/github/repos", headers=other)).status_code == 409
    assert (await client.get("/api/v1/github/repos/octo/../commits", headers=h)).status_code in (404, 422)

    assert (await client.delete("/api/v1/github/connection", headers=h)).json() == {"connected": False}
    assert any(c.startswith("DELETE api.github.com/applications/cid/grant") for c in github)
    assert (await client.get("/api/v1/github/status", headers=h)).json()["connected"] is False
