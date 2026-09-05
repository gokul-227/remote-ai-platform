"""
Application Configuration — Pydantic Settings
All configuration is loaded from environment variables or .env file.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ────────────────────────────────────────────────────────────
    APP_ENV: str = "development"
    APP_NAME: str = "Remote AI Platform"
    APP_VERSION: str = "0.1.0"
    GIT_SHA: str = "93896403d95d07367f71d68606a1b45efe1be131"
    APP_URL: str = "http://localhost:3000"
    API_URL: str = "http://localhost:8000"
    DEBUG: bool = False

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Stored as a raw comma-separated string, not List[str]: pydantic-settings
    # (2.6.1, pinned) treats List-typed fields as "complex" and tries to
    # JSON-decode any env var value for them before any validator runs,
    # raising SettingsError on a plain string like "https://example.com".
    # A str field skips that entirely; CORS_ORIGINS below parses it on read.
    CORS_ORIGINS_RAW: str = Field(
        default="http://localhost:3000,http://localhost:8000,http://localhost:8080",
        validation_alias="CORS_ORIGINS",
    )

    @property
    def CORS_ORIGINS(self) -> list[str]:  # noqa: N802
        return [origin.strip() for origin in self.CORS_ORIGINS_RAW.split(",") if origin.strip()]

    # ── Database ───────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://remote_ai_platform:remote_ai_platform_dev_password@localhost:5432/remote_ai_platform"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_POOL_TIMEOUT: int = 30
    DATABASE_POOL_RECYCLE: int = 1800

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # ── MinIO ─────────────────────────────────────────────────────────────────
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_PUBLIC_ENDPOINT: str = "http://localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin_dev_password"
    MINIO_BUCKET_RESUMES: str = "remote-ai-platform-resumes"
    MINIO_BUCKET_ASSETS: str = "remote-ai-platform-assets"
    MINIO_SECURE: bool = False

    # ── Keycloak ──────────────────────────────────────────────────────────────
    KEYCLOAK_URL: str = "http://localhost:8080"
    KEYCLOAK_PUBLIC_URL: str = "http://localhost:8080"
    KEYCLOAK_REALM: str = "remote-ai-platform"
    KEYCLOAK_CLIENT_ID: str = "remote-ai-platform-api"
    KEYCLOAK_WEB_CLIENT_ID: str = "remote-ai-platform-web"
    KEYCLOAK_CLIENT_SECRET: str = "change-me-in-production"

    # ── JWT (Internal) ────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "dev_secret_key_change_in_prod_to_32_chars_min"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Supabase Auth (target IdP -- not yet the default) ───────────────────────
    # AUTH_PROVIDER="custom_jwt" (default, current behavior: this app issues and
    # verifies its own HS256 tokens) or "supabase" (verifies Supabase Auth's own
    # asymmetric-signed tokens via JWKS; this app no longer issues tokens at all
    # -- signup/login happens entirely against Supabase from the frontend). Kept
    # switchable so the Supabase path can be built and tested without touching
    # the currently-working custom auth until it's verified end-to-end.
    AUTH_PROVIDER: str = "custom_jwt"
    SUPABASE_URL: str | None = None
    SUPABASE_JWT_AUDIENCE: str = "authenticated"
    # JWKS responses are cached in-process for this long (Supabase's own edge
    # cache is ~10 minutes; matching that avoids re-fetching more often than
    # the keys could plausibly rotate).
    SUPABASE_JWKS_CACHE_SECONDS: int = 600

    @property
    def SUPABASE_JWKS_URL(self) -> str | None:  # noqa: N802
        if not self.SUPABASE_URL:
            return None
        return f"{self.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"

    # ── AI / LiteLLM ─────────────────────────────────────────────────────────
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL_DEFAULT: str = "qwen2.5"
    OLLAMA_MODEL_CODER: str = "qwen2.5-coder"
    OLLAMA_MODEL_REASONING: str = "deepseek-coder"

    AI_PROVIDER: str = "ollama"
    AI_MODEL: str = "qwen2.5"
    AI_API_KEY: str | None = None
    LITELLM_BASE_URL: str | None = None
    AI_FALLBACK_PROVIDERS: str = "ollama/qwen2.5"
    AI_MAX_RETRIES: int = 3
    AI_TIMEOUT_SECONDS: int = 60

    # ── Security ─────────────────────────────────────────────────────────────
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    RATE_LIMIT_MAX_REQUESTS: int = 60
    MAX_RESUME_SIZE_BYTES: int = 5 * 1024 * 1024

    # Optional: production AI providers via LiteLLM
    GROQ_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None

    # ── Job Aggregator ────────────────────────────────────────────────────────
    REMOTEOK_API_URL: str = "https://remoteok.com/api"
    ARBEITNOW_API_URL: str = "https://www.arbeitnow.com/api/job-board-api"
    REMOTIVE_API_URL: str = "https://remotive.com/api/remote-jobs"
    USAJOBS_API_URL: str = "https://data.usajobs.gov/api/search"
    USAJOBS_USER_AGENT: str = "RemoteAIPlatform/0.1 (admin@remoteaiplatform.ai)"
    USAJOBS_AUTH_KEY: str | None = None
    THEMUSE_API_URL: str = "https://www.themuse.com/api/public/jobs"

    JOB_SYNC_SCHEDULE: str = "0 */6 * * *"  # Every 6 hours
    JOB_SYNC_MAX_PER_SOURCE: int = 500

    # ── Payments ──────────────────────────────────────────────────────────────
    # "sandbox" (default, no real payment network contact) or "stripe". Never
    # flips to real money processing just because STRIPE_SECRET_KEY is set --
    # that also requires explicitly setting PAYMENT_PROVIDER=stripe, and
    # whether STRIPE_SECRET_KEY itself is a test (sk_test_...) or live
    # (sk_live_...) key is a separate, deliberate choice made in the Stripe
    # dashboard, not by this app.
    PAYMENT_PROVIDER: str = "sandbox"
    STRIPE_SECRET_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None
    STRIPE_PUBLISHABLE_KEY: str | None = None

    # ── Email ─────────────────────────────────────────────────────────────────
    # "none" (default, honest no-op -- matches the behavior this app has always
    # had; no email was ever actually sent before this) or "resend".
    EMAIL_PROVIDER: str = "none"
    RESEND_API_KEY: str | None = None
    # Resend's own sandbox sender -- works with zero domain setup, but can only
    # deliver to the account owner's verified email until a real sending
    # domain is added.
    EMAIL_FROM_ADDRESS: str = "onboarding@resend.dev"
    EMAIL_FROM_NAME: str = "Remote AI Platform"

    # ── Feature Flags ─────────────────────────────────────────────────────────
    FEATURE_AI_RESUME_PARSING: bool = True
    FEATURE_AI_MATCHING: bool = True
    FEATURE_JOB_AGGREGATOR: bool = True
    FEATURE_KEYCLOAK_AUTH: bool = True
    SEED_DEMO_DATA: bool = False

    # ── Social login (direct OAuth2, no identity-broker service) ────────────────
    # Keycloak was evaluated for this and rejected: its JVM cannot boot in
    # Render's free 512MB tier (confirmed by testing), and a lighter broker
    # like Ory Hydra solves a different problem (being an OAuth *provider*,
    # not a *client* consuming Google/Microsoft) -- it would still require
    # writing this exact integration, just behind an extra service. Each
    # provider's *_CLIENT_ID is not secret; the matching *_CLIENT_SECRET is.
    FRONTEND_URL: str = "http://localhost:3000"
    GOOGLE_OAUTH_CLIENT_ID: str | None = None
    GOOGLE_OAUTH_CLIENT_SECRET: str | None = None
    MICROSOFT_OAUTH_CLIENT_ID: str | None = None
    MICROSOFT_OAUTH_CLIENT_SECRET: str | None = None
    MICROSOFT_OAUTH_TENANT: str = "common"

    # ── Error monitoring (Sentry) ────────────────────────────────────────────
    # Empty string (default) means Sentry is never initialized -- a complete
    # no-op with no network calls, warnings, or overhead. Only set SENTRY_DSN
    # (Render env var / secret) once a real Sentry project exists.
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1

    # ── Pagination ────────────────────────────────────────────────────────────
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"

    @property
    def is_production(self) -> bool:
        # Render sets RENDER=true on every service it runs, regardless of
        # whether APP_ENV was also configured. Treating a Render deployment
        # as production even if APP_ENV is missing closes a real incident:
        # an env-var wipe that dropped APP_ENV silently disarmed every check
        # below (dev JWT secret, dev MinIO creds, etc.) because is_production
        # depended on APP_ENV alone.
        import os

        return self.APP_ENV == "production" or os.environ.get("RENDER") == "true"

    def validate_production_settings(self) -> None:
        """Fail fast instead of booting with known development credentials."""
        if not self.is_production:
            return
        errors = []
        if self.DATABASE_URL.startswith("postgresql+asyncpg://remote_ai_platform:remote_ai_platform_dev_password@localhost"):
            errors.append("DATABASE_URL is still the local development default")
        if self.SEED_DEMO_DATA:
            errors.append("SEED_DEMO_DATA must not be enabled in production environments")
        if len(self.JWT_SECRET_KEY) < 32 or "dev_secret" in self.JWT_SECRET_KEY:
            errors.append("JWT_SECRET_KEY must be a high-entropy production secret")
        if self.KEYCLOAK_CLIENT_SECRET in {"change-me-in-production", ""}:
            errors.append("KEYCLOAK_CLIENT_SECRET must be configured")
        if self.MINIO_SECRET_KEY in {"minioadmin", "minioadmin_dev_password", ""}:
            errors.append("MINIO_SECRET_KEY must be configured")
        if "*" in self.CORS_ORIGINS:
            errors.append(
                "CORS_ORIGINS must not contain a wildcard in production (combined with allow_credentials=True, this permits credentialed cross-origin requests from any site)"
            )
        # Warn (non-fatal) if Redis is pointing at localhost — the app will boot but
        # rate limiting, caching and the job queue will silently degrade to in-memory
        # fallbacks.  Operators should set REDIS_URL / CELERY_BROKER_URL to a real
        # Redis instance (e.g. Upstash free tier) or accept the degraded behaviour.
        _redis_localhost_warning: list[str] = []
        if self.REDIS_URL.startswith("redis://localhost"):
            _redis_localhost_warning.append("REDIS_URL")
        if self.CELERY_BROKER_URL.startswith("redis://localhost"):
            _redis_localhost_warning.append("CELERY_BROKER_URL")
        if self.CELERY_RESULT_BACKEND.startswith("redis://localhost"):
            _redis_localhost_warning.append("CELERY_RESULT_BACKEND")
        if _redis_localhost_warning:
            import warnings

            warnings.warn(
                f"Production broker/cache config uses localhost for: {', '.join(_redis_localhost_warning)}. "
                "Rate limiting, caching and background tasks will run in degraded in-memory fallback mode. "
                "Set these env vars to a hosted Redis URL (e.g. Upstash) to enable full functionality.",
                stacklevel=2,
            )
        if errors:
            raise RuntimeError("Invalid production configuration: " + "; ".join(errors))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
