"""The staff console's origin is allowed only by the API of its own environment."""

from app.core.config import Settings


def test_admin_console_origin_is_environment_specific():
    prod = Settings(APP_ENV="production", CORS_ORIGINS="https://remoteaiplatform.com")
    dev = Settings(APP_ENV="development", CORS_ORIGINS="https://dev.remoteaiplatform.com")
    assert "https://admin.remoteaiplatform.com" in prod.CORS_ORIGINS
    assert "https://admin-dev.remoteaiplatform.com" not in prod.CORS_ORIGINS
    assert "https://admin-dev.remoteaiplatform.com" in dev.CORS_ORIGINS
    assert "https://admin.remoteaiplatform.com" not in dev.CORS_ORIGINS
