"""
Regression tests for the CORS / security-headers / API-docs-exposure slice
of the app-security audit.

`app.main.app` is a module-level singleton built once at import time under
the test suite's normal (non-production) settings, so a couple of these
tests build a *fresh* app via `create_app()` after monkeypatching
`settings.APP_ENV` to "production" -- this exercises the same environment
branch Render actually runs under without mutating the shared `app` object
other test modules import.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import app, create_app


@pytest.mark.asyncio
async def test_docs_endpoints_are_public_in_development():
    """Ground-rule check: /docs must stay open in local dev (unchanged behavior)."""
    assert settings.is_production is False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for path in ("/docs", "/redoc", "/openapi.json"):
            response = await client.get(path)
            assert response.status_code == 200, path


@pytest.mark.asyncio
async def test_docs_endpoints_are_disabled_in_production(monkeypatch):
    """
    /docs, /redoc and /openapi.json map the entire API surface -- every route,
    request/response schema, and auth requirement -- for anyone who asks.
    Previously enabled unconditionally regardless of environment; must 404 in
    a production-like config.
    """
    monkeypatch.setattr(settings, "APP_ENV", "production")
    prod_app = create_app()

    transport = ASGITransport(app=prod_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for path in ("/docs", "/redoc", "/openapi.json"):
            response = await client.get(path)
            assert response.status_code == 404, path


@pytest.mark.asyncio
async def test_security_headers_present_on_normal_response():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/live")
        assert response.status_code == 200
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert response.headers["X-Frame-Options"] == "DENY"
        assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
        assert "camera=()" in response.headers["Permissions-Policy"]
        assert "max-age=" in response.headers["Strict-Transport-Security"]


@pytest.mark.asyncio
async def test_cors_rejects_disallowed_origin():
    """
    CORS_ORIGINS is an explicit allowlist (see app.core.config.Settings) --
    a request whose Origin header isn't on that list must not get an
    Access-Control-Allow-Origin back, even for a simple (non-preflight) GET,
    since allow_credentials=True means the browser will only expose the
    response to script if that header echoes the request's own origin.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/health/live", headers={"Origin": "https://evil-attacker.example"}
        )
        assert response.status_code == 200  # request itself isn't blocked server-side
        assert "access-control-allow-origin" not in {k.lower() for k in response.headers}


@pytest.mark.asyncio
async def test_cors_accepts_allowlisted_origin():
    allowed_origin = settings.CORS_ORIGINS[0]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/live", headers={"Origin": allowed_origin})
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == allowed_origin
        assert response.headers["access-control-allow-credentials"] == "true"


def test_production_settings_reject_wildcard_cors(monkeypatch):
    """
    allow_origins=["*"] combined with allow_credentials=True (as configured in
    app.main.create_app) would let any site make credentialed cross-origin
    requests. validate_production_settings() must keep refusing to boot with
    that combination in a production-like environment.
    """
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "CORS_ORIGINS_RAW", "*")
    # Satisfy the other production checks so the CORS one is isolated.
    monkeypatch.setattr(
        settings,
        "DATABASE_URL",
        "postgresql+asyncpg://user:pass@real-host:5432/db",
    )
    monkeypatch.setattr(settings, "SEED_DEMO_DATA", False)
    monkeypatch.setattr(
        settings, "JWT_SECRET_KEY", "a" * 40
    )
    monkeypatch.setattr(settings, "KEYCLOAK_CLIENT_SECRET", "a-real-secret")
    monkeypatch.setattr(settings, "MINIO_SECRET_KEY", "a-real-secret")

    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        settings.validate_production_settings()
