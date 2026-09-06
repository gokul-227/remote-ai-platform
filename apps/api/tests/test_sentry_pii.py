"""Regression tests for Sentry PII scrubbing (see app/main.py).

These cover two distinct leak vectors that `send_default_pii=False` alone
does NOT close:

1. Request bodies are attached to error events by default regardless of
   send_default_pii (that flag only gates things like client IP/cookies) --
   `_sentry_before_send` is the only thing standing between "user submits a
   password" and that password sitting in Sentry in cleartext, so its key
   matching must be robust to real field-name variants used by this app's
   own schemas (new_password, current_password, reset_token, password_hash,
   ...), not just the literal strings "password"/"token".
2. Sentry's SDK captures a snapshot of local variables in every stack frame
   of a captured exception by default (`include_local_variables`), which is
   a completely separate switch from send_default_pii and is never touched
   by `_sentry_before_send` (which only scrubs event["request"]).
"""

import pytest

from app.main import _sentry_before_send, init_sentry


@pytest.mark.parametrize(
    "field_name",
    [
        "password",
        "new_password",
        "current_password",
        "confirm_password",
        "password_hash",
        "token",
        "access_token",
        "refresh_token",
        "reset_token",
        "authorization",
        "Authorization",
        "cookie",
        "secret",
        "client_secret",
        "stripe_secret_key",
        "api_key",
        "apikey",
    ],
)
def test_before_send_scrubs_real_schema_field_name_variants(field_name):
    """Every sensitive field name this app's own Pydantic schemas actually
    use (see app/domains/auth/schemas.py: new_password, current_password,
    reset_token, password_hash, ...) must be redacted, not just the
    generic "password"/"token" literals."""
    event = {
        "request": {
            "data": {field_name: "super-secret-value", "email": "user@example.com"},
        }
    }
    scrubbed = _sentry_before_send(event, {})
    assert scrubbed["request"]["data"][field_name] == "[Filtered]"
    # Non-sensitive fields are left alone.
    assert scrubbed["request"]["data"]["email"] == "user@example.com"


def test_before_send_scrubs_nested_and_cookie_header_data():
    event = {
        "request": {
            "headers": {"Authorization": "Bearer abc.def.ghi", "User-Agent": "pytest"},
            "cookies": {"session": "abc123"},
            "data": {"nested": {"refresh_token": "r-123"}},
        }
    }
    scrubbed = _sentry_before_send(event, {})
    assert scrubbed["request"]["headers"]["Authorization"] == "[Filtered]"
    assert scrubbed["request"]["headers"]["User-Agent"] == "pytest"
    assert scrubbed["request"]["cookies"]["session"] == "[Filtered]"
    assert scrubbed["request"]["data"]["nested"]["refresh_token"] == "[Filtered]"


def test_before_send_handles_missing_request_key():
    """An event with no "request" key (e.g. a background-task error) must
    pass through unchanged rather than raising."""
    event = {"message": "boom"}
    assert _sentry_before_send(event, {}) == {"message": "boom"}


def test_init_sentry_disables_local_variable_capture(monkeypatch):
    """include_local_variables defaults to True in the SDK and is not gated
    by send_default_pii -- init_sentry must explicitly turn it off, or
    stack-trace locals (plaintext passwords/tokens/resume text sitting in a
    local variable when an exception is raised) ship to Sentry unscrubbed."""
    from app.core.config import settings

    captured_kwargs = {}

    def fake_init(**kwargs):
        captured_kwargs.update(kwargs)

    monkeypatch.setattr("app.main.sentry_sdk.init", fake_init)
    monkeypatch.setattr(settings, "SENTRY_DSN", "https://fake@example.ingest.sentry.io/1")

    init_sentry()

    assert captured_kwargs.get("include_local_variables") is False
    assert captured_kwargs.get("send_default_pii") is False
    assert captured_kwargs.get("before_send") is _sentry_before_send


def test_init_sentry_is_a_noop_without_dsn(monkeypatch):
    from app.core.config import settings

    called = False

    def fake_init(**kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr("app.main.sentry_sdk.init", fake_init)
    monkeypatch.setattr(settings, "SENTRY_DSN", "")

    init_sentry()

    assert called is False
