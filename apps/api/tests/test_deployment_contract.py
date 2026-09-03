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
