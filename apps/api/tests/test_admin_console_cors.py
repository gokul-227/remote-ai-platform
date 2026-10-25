"""The staff console's origin is allowed only by the API of its own environment."""

from app.core.config import Settings


def test_admin_console_origin_is_environment_specific():
    prod = Settings(APP_ENV="production", CORS_ORIGINS="https://remoteaiplatform.com")
    dev = Settings(APP_ENV="development", CORS_ORIGINS="https://dev.remoteaiplatform.com")
    assert "https://admin.remoteaiplatform.com" in prod.CORS_ORIGINS
    assert "https://admin-dev.remoteaiplatform.com" not in prod.CORS_ORIGINS
    assert "https://admin-dev.remoteaiplatform.com" in dev.CORS_ORIGINS
    assert "https://admin.remoteaiplatform.com" not in dev.CORS_ORIGINS


def test_hosted_dev_api_allows_dev_console():
    staging = Settings(APP_ENV="staging", CORS_ORIGINS="https://dev.remoteaiplatform.com")
    assert "https://admin-dev.remoteaiplatform.com" in staging.CORS_ORIGINS
    assert "https://admin.remoteaiplatform.com" not in staging.CORS_ORIGINS
