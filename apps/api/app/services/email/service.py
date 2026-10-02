"""Provider-independent transactional email.

Mirrors the same shape as app.services.payments: a Protocol interface, a
default no-op provider (honest -- no email was ever actually sent before
this, so a silent no-op preserves that rather than pretending), and a real
provider selected only by explicit config.
"""

from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("services.email")


def _recipient_domain(to: str) -> str:
    """Logs name only the recipient's domain: enough to spot a provider or DNS
    problem, without writing personal addresses into logs (PRIV-01)."""
    return to.rsplit("@", 1)[-1].lower() if "@" in to else "invalid"

RESEND_API_URL = "https://api.resend.com/emails"


@dataclass(frozen=True)
class EmailResult:
    sent: bool
    provider_message_id: str | None = None
    # Redacted failure category ("HTTP 429", "ConnectTimeout"); never a body.
    error: str | None = None
    # False for failures a retry cannot fix (bad address, rejected content).
    retryable: bool = True


class EmailProvider(Protocol):
    async def send_email(
        self, to: str, subject: str, html: str, idempotency_key: str | None = None
    ) -> EmailResult: ...


class NoopEmailProvider:
    """Default. Logs the intent to send rather than silently swallowing it,
    but never contacts a real email network -- matches this app's actual
    behavior prior to any email provider existing at all."""

    async def send_email(
        self, to: str, subject: str, html: str, idempotency_key: str | None = None
    ) -> EmailResult:
        logger.info("Email suppressed (EMAIL_PROVIDER=none)", recipient_domain=_recipient_domain(to))
        return EmailResult(sent=False, error="email disabled", retryable=False)


class ResendEmailProvider:
    def __init__(self) -> None:
        if not settings.RESEND_API_KEY:
            raise RuntimeError("RESEND_API_KEY must be set to use EMAIL_PROVIDER=resend")

    async def send_email(
        self, to: str, subject: str, html: str, idempotency_key: str | None = None
    ) -> EmailResult:
        headers = {"Authorization": f"Bearer {settings.RESEND_API_KEY}"}
        if idempotency_key:
            # Resend drops a repeat of the same key, so a retry after an
            # unacknowledged success does not deliver twice (MAIL-01).
            headers["Idempotency-Key"] = idempotency_key[:256]
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    RESEND_API_URL,
                    headers=headers,
                    json={
                        "from": f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM_ADDRESS}>",
                        "to": [to],
                        "subject": subject,
                        "html": html,
                    },
                )
        except httpx.HTTPError as e:
            logger.error("Resend email send failed", recipient_domain=_recipient_domain(to), error=type(e).__name__)
            return EmailResult(sent=False, error=type(e).__name__)
        if response.status_code >= 400:
            # Status only: the provider's error body can echo the address and content.
            logger.error(
                "Resend email send failed",
                recipient_domain=_recipient_domain(to),
                status_code=response.status_code,
            )
            # 422/400: the message itself is unacceptable; 429/5xx: try later.
            retryable = response.status_code == 429 or response.status_code >= 500
            return EmailResult(sent=False, error=f"HTTP {response.status_code}", retryable=retryable)
        return EmailResult(sent=True, provider_message_id=response.json().get("id"))


def get_email_provider() -> NoopEmailProvider | ResendEmailProvider:
    if settings.EMAIL_PROVIDER == "resend":
        return ResendEmailProvider()
    return NoopEmailProvider()
