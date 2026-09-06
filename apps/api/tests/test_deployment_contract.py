import pytest


def test_production_settings_reject_development_secrets(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "JWT_SECRET_KEY", "dev_secret_key_change_in_prod_to_32_chars_min")
    monkeypatch.setattr(settings, "KEYCLOAK_CLIENT_SECRET", "change-me-in-production")
    monkeypatch.setattr(settings, "MINIO_SECRET_KEY", "minioadmin_dev_password")
    with pytest.raises(RuntimeError, match="Invalid production configuration"):
        settings.validate_production_settings()


def test_development_settings_allow_local_defaults(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "APP_ENV", "development")
    settings.validate_production_settings()


def test_render_env_is_treated_as_production_even_if_app_env_is_missing(monkeypatch):
    """Regression test for a real incident: a Render env-var wipe dropped
    APP_ENV, which silently disabled every production safety check because
    is_production depended on APP_ENV alone. Render always sets RENDER=true,
    so that must independently trigger production semantics."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "APP_ENV", "development")
    monkeypatch.setenv("RENDER", "true")
    assert settings.is_production is True
    monkeypatch.setattr(settings, "JWT_SECRET_KEY", "dev_secret_key_change_in_prod_to_32_chars_min")
    with pytest.raises(RuntimeError, match="Invalid production configuration"):
        settings.validate_production_settings()


def test_production_settings_reject_dev_default_database_url(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(
        settings,
        "DATABASE_URL",
        "postgresql+asyncpg://remote_ai_platform:remote_ai_platform_dev_password@localhost:5432/remote_ai_platform",
    )
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        settings.validate_production_settings()


def test_production_settings_reject_any_localhost_database_url(monkeypatch):
    """Even a DATABASE_URL with different credentials than the known dev
    default must be rejected in production if it still points at localhost --
    it can never be reachable from a real deployment."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(
        settings,
        "DATABASE_URL",
        "postgresql+asyncpg://someuser:somepassword@localhost:5432/somedb",
    )
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        settings.validate_production_settings()


def test_production_settings_reject_debug_enabled(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "DEBUG", True)
    with pytest.raises(RuntimeError, match="DEBUG"):
        settings.validate_production_settings()


def test_production_settings_reject_localhost_minio_endpoint(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "MINIO_ENDPOINT", "localhost:9000")
    with pytest.raises(RuntimeError, match="MINIO_ENDPOINT"):
        settings.validate_production_settings()


def test_production_settings_reject_localhost_minio_public_endpoint(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "MINIO_PUBLIC_ENDPOINT", "http://127.0.0.1:9000")
    with pytest.raises(RuntimeError, match="MINIO_PUBLIC_ENDPOINT"):
        settings.validate_production_settings()


def test_production_settings_reject_wildcard_cors(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "CORS_ORIGINS_RAW", "*")
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        settings.validate_production_settings()
