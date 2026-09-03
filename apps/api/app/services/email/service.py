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

RESEND_API_URL = "https://api.resend.com/emails"


@dataclass(frozen=True)
class EmailResult:
    sent: bool
    provider_message_id: str | None = None


class EmailProvider(Protocol):
    async def send_email(self, to: str, subject: str, html: str) -> EmailResult: ...


class NoopEmailProvider:
    """Default. Logs the intent to send rather than silently swallowing it,
    but never contacts a real email network -- matches this app's actual
    behavior prior to any email provider existing at all."""

    async def send_email(self, to: str, subject: str, html: str) -> EmailResult:
        logger.info("Email suppressed (EMAIL_PROVIDER=none)", to=to, subject=subject)
        return EmailResult(sent=False)


class ResendEmailProvider:
    def __init__(self) -> None:
        if not settings.RESEND_API_KEY:
            raise RuntimeError("RESEND_API_KEY must be set to use EMAIL_PROVIDER=resend")

    async def send_email(self, to: str, subject: str, html: str) -> EmailResult:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                RESEND_API_URL,
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json={
                    "from": f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM_ADDRESS}>",
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
            )
        if response.status_code >= 400:
            logger.error(
                "Resend email send failed",
                to=to,
                status_code=response.status_code,
                body=response.text[:500],
            )
            return EmailResult(sent=False)
        return EmailResult(sent=True, provider_message_id=response.json().get("id"))


def get_email_provider() -> NoopEmailProvider | ResendEmailProvider:
    if settings.EMAIL_PROVIDER == "resend":
        return ResendEmailProvider()
    return NoopEmailProvider()
