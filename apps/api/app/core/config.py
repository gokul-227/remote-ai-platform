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
    # Legacy name for the Redis URL, from when Celery used Redis as a broker.
    # Only read as a fallback when REDIS_URL is not configured (see redis_url).
    CELERY_BROKER_URL: str | None = None

    # ── MinIO ─────────────────────────────────────────────────────────────────
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_PUBLIC_ENDPOINT: str = "http://localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin_dev_password"
    MINIO_BUCKET_RESUMES: str = "remote-ai-platform-resumes"
    MINIO_BUCKET_ASSETS: str = "remote-ai-platform-assets"
    MINIO_SECURE: bool = False

    # ── Supabase Auth (the only identity provider) ──────────────────────────────
    # Sign-in happens entirely against Supabase from the frontend; this API
    # verifies Supabase's asymmetrically signed access tokens via JWKS and
    # never issues tokens itself.
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

    AI_PROVIDER: str = "auto"
    AI_MODEL: str = "qwen2.5"
    AI_API_KEY: str | None = None
    LITELLM_BASE_URL: str | None = None
    AI_FALLBACK_PROVIDERS: str = "ollama/qwen2.5"
    AI_MAX_RETRIES: int = 3
    AI_TIMEOUT_SECONDS: int = 60
    # Total time allowed for resume parsing across all models tried; the
    # web client waits longer than this for the upload request.
    RESUME_PARSE_BUDGET_SECONDS: int = 45

    # ── Security ─────────────────────────────────────────────────────────────
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    RATE_LIMIT_MAX_REQUESTS: int = 60
    MAX_RESUME_SIZE_BYTES: int = 5 * 1024 * 1024

    # Optional: production AI providers via LiteLLM
    GROQ_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    OPENROUTER_API_KEY: str | None = None
    CEREBRAS_API_KEY: str | None = None
    MISTRAL_API_KEY: str | None = None

    # AI_PROVIDER="auto": try these free-tier models in order, skipping any
    # provider whose API key is not set. Override the list via env to follow
    # the providers' current free model names.
    AI_FREE_TIER_CHAIN: str = (
        "groq/openai/gpt-oss-120b,"
        "groq/openai/gpt-oss-20b,"
        "gemini/gemini-2.0-flash,"
        "cerebras/llama-3.3-70b,"
        "openrouter/meta-llama/llama-3.3-70b-instruct:free,"
        "mistral/mistral-small-latest"
    )
    # Upper bound for one completion across every model tried.
    AI_TOTAL_BUDGET_SECONDS: int = 45

    # Token allowances (prompt + completion). Checked before each call, so a
    # user can overshoot by at most one request.
    AI_FREE_MONTHLY_TOKENS: int = 20_000
    AI_PRO_MONTHLY_TOKENS: int = 50_000
    # Platform-wide cap per UTC day, protecting the providers' free quotas.
    AI_GLOBAL_DAILY_TOKENS: int = 300_000

    # ── Job Aggregator ────────────────────────────────────────────────────────
    REMOTEOK_API_URL: str = "https://remoteok.com/api"
    ARBEITNOW_API_URL: str = "https://www.arbeitnow.com/api/job-board-api"
    REMOTIVE_API_URL: str = "https://remotive.com/api/remote-jobs"
    USAJOBS_API_URL: str = "https://data.usajobs.gov/api/search"
    USAJOBS_USER_AGENT: str = "RemoteAIPlatform/0.1 (support@remoteaiplatform.com)"
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
    # Master switch for funding and releasing money through the platform.
    # Off by default: the marketplace lifecycle (recipient onboarding,
    # transfers to engineers, payouts, disputes, reconciliation) is not
    # complete, so neither provider may move or pretend to move money until
    # the product owner deliberately enables it. Refunds of existing holds
    # stay available regardless so no funds are ever stranded.
    MARKETPLACE_PAYMENTS_ENABLED: bool = False

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
    def redis_url(self) -> str:
        """REDIS_URL, or the legacy CELERY_BROKER_URL when only that is set."""
        if self.REDIS_URL.startswith("redis://localhost") and self.CELERY_BROKER_URL:
            return self.CELERY_BROKER_URL
        return self.REDIS_URL

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
        elif "localhost" in self.DATABASE_URL or "127.0.0.1" in self.DATABASE_URL:
            # Broader than the exact-default check above: catches any
            # locally-pointed DATABASE_URL, even one with different
            # credentials, which can never be reachable from production.
            errors.append("DATABASE_URL must not point at localhost/127.0.0.1 in production")
        if self.DEBUG:
            errors.append(
                "DEBUG must not be enabled in production (it exposes verbose tracebacks/internals to clients)"
            )
        if not self.SUPABASE_URL:
            errors.append("SUPABASE_URL must be configured (it is the only sign-in path)")
        if self.MINIO_SECRET_KEY in {"minioadmin", "minioadmin_dev_password", ""}:
            errors.append("MINIO_SECRET_KEY must be configured")
        # MINIO_ENDPOINT/MINIO_PUBLIC_ENDPOINT double as the real object-storage
        # endpoint in production (Supabase Storage's S3-compatible endpoint --
        # see storage.py), so a localhost value here is never correct in prod,
        # not just a "still using MinIO" smell.
        if "localhost" in self.MINIO_ENDPOINT or "127.0.0.1" in self.MINIO_ENDPOINT:
            errors.append("MINIO_ENDPOINT must not point at localhost/127.0.0.1 in production")
        if "localhost" in self.MINIO_PUBLIC_ENDPOINT or "127.0.0.1" in self.MINIO_PUBLIC_ENDPOINT:
            errors.append("MINIO_PUBLIC_ENDPOINT must not point at localhost/127.0.0.1 in production")
        if "*" in self.CORS_ORIGINS:
            errors.append(
                "CORS_ORIGINS must not contain a wildcard in production (combined with allow_credentials=True, this permits credentialed cross-origin requests from any site)"
            )
        # Warn (non-fatal) if Redis is pointing at localhost — the app will boot but
        # rate limiting, caching and the job queue will silently degrade to in-memory
        # fallbacks.  Operators should set REDIS_URL to a real
        # Redis instance (e.g. Upstash free tier) or accept the degraded behaviour.
        _redis_localhost_warning: list[str] = []
        if self.redis_url.startswith("redis://localhost"):
            _redis_localhost_warning.append("REDIS_URL")
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
