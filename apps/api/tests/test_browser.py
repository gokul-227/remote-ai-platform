"""In-app browser: signed view tokens, public-host checks on every hop, sandboxed responses. No network."""

import socket

import httpx
import pytest
from httpx import AsyncClient

import app.domains.browser.router as browser


@pytest.fixture
def web(monkeypatch):
    """Resolve every host to a public address unless the test says otherwise, and fake the site."""
    addrs = {
        "example.com": "93.184.216.34",
        "redirect.example": "93.184.216.35",
        "evil.example": "10.0.0.5",
    }

    async def fake_resolve(host: str) -> list[str]:
        if host in {"127.0.0.1"}:
            return [host]
        if host not in addrs:
            raise socket.gaierror("unknown")
        return [addrs[host]]

    monkeypatch.setattr(browser, "_resolve", fake_resolve)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "redirect.example":
            return httpx.Response(302, headers={"location": "http://evil.example/admin"})
        return httpx.Response(
            200,
            headers={"content-type": "text/html; charset=utf-8", "x-frame-options": "DENY"},
            text="<html><head><title>Hi</title></head><body><a href='/next'>next</a></body></html>",
        )

    real = httpx.AsyncClient
    monkeypatch.setattr(
        browser.httpx,
        "AsyncClient",
        lambda **kw: real(transport=httpx.MockTransport(handler), **kw),
    )


async def _token(client: AsyncClient, headers: dict, url: str) -> httpx.Response:
    return await client.post("/api/v1/browser/views", json={"url": url}, headers=headers)


@pytest.mark.asyncio
async def test_view_requires_sign_in(client: AsyncClient):
    assert (
        await client.post("/api/v1/browser/views", json={"url": "https://example.com"})
    ).status_code == 401


@pytest.mark.asyncio
async def test_page_is_served_sandboxed_with_base_and_nav_script(
    client: AsyncClient, auth_headers, web
):
    r = await _token(client, auth_headers, "example.com")
    assert r.status_code == 200
    assert r.json()["url"] == "https://example.com"
    page = await client.get(r.json()["view_path"])
    assert page.status_code == 200
    csp = page.headers["content-security-policy"]
    assert csp.startswith("sandbox allow-scripts")
    assert "allow-same-origin" not in csp
    assert "frame-ancestors" in csp
    assert '<base href="https://example.com">' in page.text
    assert "rap-browser-nav" in page.text


@pytest.mark.asyncio
async def test_private_hosts_are_refused_including_after_redirect(
    client: AsyncClient, auth_headers, web
):
    assert (await _token(client, auth_headers, "http://evil.example")).status_code == 422
    assert (await _token(client, auth_headers, "http://127.0.0.1")).status_code == 422
    assert (await _token(client, auth_headers, "http://localhost:8000")).status_code == 422
    r = await _token(client, auth_headers, "http://redirect.example")
    assert r.status_code == 200
    assert (await client.get(r.json()["view_path"])).status_code == 422


@pytest.mark.asyncio
async def test_tampered_or_bad_scheme_is_rejected(client: AsyncClient, auth_headers, web):
    r = await _token(client, auth_headers, "https://example.com")
    path = r.json()["view_path"]
    tampered = path[:-1] + ("0" if path[-1] != "0" else "1")  # always a different signature
    assert (await client.get(tampered)).status_code == 403
    assert (await _token(client, auth_headers, "file:///etc/passwd")).status_code == 422
    assert (await _token(client, auth_headers, "https://user:pw@example.com")).status_code == 422
