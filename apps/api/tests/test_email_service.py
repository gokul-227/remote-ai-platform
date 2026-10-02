from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.core.config import settings
from app.services.email.service import (
    NoopEmailProvider,
    ResendEmailProvider,
    get_email_provider,
)
from app.services.notifications.service import notify_user


@pytest.mark.asyncio
async def test_default_provider_is_noop_and_does_not_send(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "none")
    provider = get_email_provider()
    assert isinstance(provider, NoopEmailProvider)
    result = await provider.send_email("someone@example.com", "Hi", "<p>hi</p>")
    assert result.sent is False


def test_resend_provider_requires_api_key(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "resend")
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)
    with pytest.raises(RuntimeError, match="RESEND_API_KEY"):
        get_email_provider()


@pytest.mark.asyncio
async def test_resend_provider_sends_via_http(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "resend")
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key")

    mock_response = httpx.Response(200, json={"id": "msg_123"})
    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=mock_response)) as mock_post:
        provider = get_email_provider()
        assert isinstance(provider, ResendEmailProvider)
        result = await provider.send_email("someone@example.com", "Hi", "<p>hi</p>")

    assert result.sent is True
    assert result.provider_message_id == "msg_123"
    call_kwargs = mock_post.call_args.kwargs
    assert call_kwargs["json"]["to"] == ["someone@example.com"]
    assert "Authorization" in call_kwargs["headers"]


@pytest.mark.asyncio
async def test_resend_provider_failure_does_not_raise(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "resend")
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key")

    mock_response = httpx.Response(422, text="invalid recipient")
    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=mock_response)):
        provider = get_email_provider()
        result = await provider.send_email("bad@example.com", "Hi", "<p>hi</p>")

    assert result.sent is False


@pytest.mark.asyncio
async def test_notify_user_without_email_html_never_touches_email_provider(monkeypatch):
    from conftest import TestingSessionLocal

    from app.domains.auth.models import User, UserRole

    called = AsyncMock()
    monkeypatch.setattr("app.services.notifications.service.get_email_provider", lambda: called)

    async with TestingSessionLocal() as db:
        user = User(
            email="no-email-notif@example.com",
            full_name="No Email",
            role=UserRole.ENGINEER,
        )
        db.add(user)
        await db.flush()
        await notify_user(db, user.id, "Title", "Body", "generic")
        await db.commit()

    called.send_email.assert_not_called()


@pytest.mark.asyncio
async def test_notify_user_with_email_html_sends_email(monkeypatch):
    from conftest import TestingSessionLocal

    from app.domains.auth.models import User, UserRole

    fake_provider = AsyncMock()
    fake_provider.send_email = AsyncMock()
    monkeypatch.setattr(
        "app.services.notifications.service.get_email_provider", lambda: fake_provider
    )

    async with TestingSessionLocal() as db:
        user = User(
            email="with-email-notif@example.com",
            full_name="With Email",
            role=UserRole.ENGINEER,
        )
        db.add(user)
        await db.flush()
        await notify_user(
            db, user.id, "Application update", "Body", "application_status", email_html="<p>hi</p>"
        )
        await db.commit()

    fake_provider.send_email.assert_awaited_once_with(
        to="with-email-notif@example.com", subject="Application update", html="<p>hi</p>"
    )


@pytest.mark.asyncio
async def test_email_logs_never_contain_the_address_or_provider_body(monkeypatch):
    """PRIV-01: failure and no-op logs name only the recipient's domain."""
    from unittest.mock import AsyncMock, MagicMock

    from app.services.email import service as email_service

    logged: list[tuple] = []
    fake_logger = MagicMock()
    fake_logger.info.side_effect = lambda *a, **k: logged.append((a, k))
    fake_logger.error.side_effect = lambda *a, **k: logged.append((a, k))
    monkeypatch.setattr(email_service, "logger", fake_logger)

    await email_service.NoopEmailProvider().send_email("pat@example.com", "Subject", "<p>x</p>")

    monkeypatch.setattr(email_service.settings, "RESEND_API_KEY", "re_test")
    resp = MagicMock(status_code=422, text='{"message":"invalid to: pat@example.com"}')
    client = AsyncMock()
    client.__aenter__.return_value.post = AsyncMock(return_value=resp)
    monkeypatch.setattr(email_service.httpx, "AsyncClient", lambda **kw: client)
    result = await email_service.ResendEmailProvider().send_email("pat@example.com", "S", "<p>x</p>")

    assert result.sent is False
    assert logged
    assert "pat@example.com" not in repr(logged)
    assert all(k.get("recipient_domain") == "example.com" for _, k in logged)
