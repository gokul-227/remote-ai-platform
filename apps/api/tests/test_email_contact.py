"""Every outgoing email names the single public contact address and no vendor or personal details."""

import re

from app.core.config import settings
from app.domains.network.contacts import _invite_html
from app.services.email.outbox import render_email

CONTACT = "contact@remoteaiplatform.com"
BANNED = re.compile(
    r"supabase|brevo|resend|workos|oracle|cloudflare|infisical|@gmail\.com|gokul", re.I
)


def test_support_email_default_is_public_contact() -> None:
    assert settings.SUPPORT_EMAIL == CONTACT


def test_notification_email_footer_has_contact_address() -> None:
    html = render_email("Application update", "Your application moved forward.", "jobs")
    assert CONTACT in html
    assert not BANNED.search(html)
    assert set(re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", html)) == {CONTACT}


def test_invitation_email_has_contact_address() -> None:
    html = _invite_html("Ada", "https://example.org/join", "https://example.org/stop")
    assert CONTACT in html
    assert not BANNED.search(html)
