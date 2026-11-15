"""Brevo transactional email provider."""

import httpx
import pytest

from app.core.config import settings
from app.services.email import service


class _Resp:
    def __init__(self, status: int, body: dict) -> None:
        self.status_code = status
        self._body = body

    def json(self) -> dict:
        return self._body


def _client(capture: dict, resp: _Resp | Exception):
    class C:
        def __init__(self, *a, **k) -> None: ...
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            capture.update(url=url, headers=headers, json=json)
            if isinstance(resp, Exception):
                raise resp
            return resp

    return C


@pytest.mark.asyncio
async def test_brevo_sends_with_sender_and_returns_message_id(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "brevo")
    monkeypatch.setattr(settings, "BREVO_API_KEY", "xkeysib-test")
    cap: dict = {}
    monkeypatch.setattr(
        service.httpx, "AsyncClient", _client(cap, _Resp(201, {"messageId": "<m1>"}))
    )
    p = service.get_email_provider()
    assert isinstance(p, service.BrevoEmailProvider)
    r = await p.send_email("a@example.org", "Hi", "<p>x</p>", idempotency_key="k1")
    assert r.sent
    assert r.provider_message_id == "<m1>"
    assert cap["url"] == service.BREVO_API_URL
    assert cap["headers"]["api-key"] == "xkeysib-test"
    assert cap["json"]["to"] == [{"email": "a@example.org"}]
    assert cap["json"]["sender"]["email"] == settings.EMAIL_FROM_ADDRESS
    assert cap["json"]["headers"]["X-Idempotency-Key"] == "k1"


@pytest.mark.asyncio
@pytest.mark.parametrize(("status", "retryable"), [(400, False), (429, True), (503, True)])
async def test_brevo_errors_are_redacted_and_classified(monkeypatch, status, retryable):
    monkeypatch.setattr(settings, "BREVO_API_KEY", "xkeysib-test")
    monkeypatch.setattr(
        service.httpx, "AsyncClient", _client({}, _Resp(status, {"message": "secret body"}))
    )
    r = await service.BrevoEmailProvider().send_email("a@example.org", "Hi", "x")
    assert not r.sent
    assert r.error == f"HTTP {status}"
    assert r.retryable is retryable


@pytest.mark.asyncio
async def test_brevo_network_error_is_retryable(monkeypatch):
    monkeypatch.setattr(settings, "BREVO_API_KEY", "xkeysib-test")
    monkeypatch.setattr(service.httpx, "AsyncClient", _client({}, httpx.ConnectTimeout("t")))
    r = await service.BrevoEmailProvider().send_email("a@example.org", "Hi", "x")
    assert not r.sent
    assert r.retryable
    assert r.error == "ConnectTimeout"


def test_brevo_requires_key(monkeypatch):
    monkeypatch.setattr(settings, "BREVO_API_KEY", None)
    with pytest.raises(RuntimeError):
        service.BrevoEmailProvider()
