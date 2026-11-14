"""Retired proxy endpoints cannot fetch sites or bypass framing policies."""

import httpx
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_view_requires_sign_in(client: AsyncClient):
    assert (await client.post("/api/v1/browser/views", json={"url": "https://example.com"})).status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("url", ["https://example.com", "http://127.0.0.1/admin", "file:///etc/passwd"])
async def test_old_proxy_cannot_fetch_any_target(client: AsyncClient, auth_headers, monkeypatch, url):
    def network_forbidden(*args, **kwargs):
        raise AssertionError("The retired proxy must never create an upstream client")

    monkeypatch.setattr(httpx, "AsyncClient", network_forbidden)
    created = await client.post("/api/v1/browser/views", json={"url": url}, headers=auth_headers)
    assert created.status_code == 410
    assert "new tab" in created.json()["detail"]
    old_view = await client.get("/api/v1/browser/view", params={"t": "historical-signed-token"})
    assert old_view.status_code == 410
    assert "new tab" in old_view.json()["detail"]
