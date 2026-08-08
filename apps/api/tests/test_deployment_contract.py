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
