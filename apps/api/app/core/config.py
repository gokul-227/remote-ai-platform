"""
Application Configuration — Pydantic Settings
All configuration is loaded from environment variables or .env file.
"""

from functools import lru_cache
from typing import List, Optional

from pydantic import AnyHttpUrl, Field
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
    def CORS_ORIGINS(self) -> List[str]:
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

    # ── AI / LiteLLM ─────────────────────────────────────────────────────────
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL_DEFAULT: str = "qwen2.5"
    OLLAMA_MODEL_CODER: str = "qwen2.5-coder"
    OLLAMA_MODEL_REASONING: str = "deepseek-coder"

    AI_PROVIDER: str = "ollama"
    AI_MODEL: str = "qwen2.5"
    AI_API_KEY: Optional[str] = None
    LITELLM_BASE_URL: Optional[str] = None
    AI_FALLBACK_PROVIDERS: str = "ollama/qwen2.5"
    AI_MAX_RETRIES: int = 3
    AI_TIMEOUT_SECONDS: int = 60

    # ── Security ─────────────────────────────────────────────────────────────
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    RATE_LIMIT_MAX_REQUESTS: int = 60
    MAX_RESUME_SIZE_BYTES: int = 5 * 1024 * 1024

    # Optional: production AI providers via LiteLLM
    GROQ_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None

    # ── Job Aggregator ────────────────────────────────────────────────────────
    REMOTEOK_API_URL: str = "https://remoteok.com/api"
    ARBEITNOW_API_URL: str = "https://www.arbeitnow.com/api/job-board-api"
    REMOTIVE_API_URL: str = "https://remotive.com/api/remote-jobs"
    USAJOBS_API_URL: str = "https://data.usajobs.gov/api/search"
    USAJOBS_USER_AGENT: str = "RemoteAIPlatform/0.1 (admin@remoteaiplatform.ai)"
    USAJOBS_AUTH_KEY: Optional[str] = None
    THEMUSE_API_URL: str = "https://www.themuse.com/api/public/jobs"

    JOB_SYNC_SCHEDULE: str = "0 */6 * * *"  # Every 6 hours
    JOB_SYNC_MAX_PER_SOURCE: int = 500

    # ── Feature Flags ─────────────────────────────────────────────────────────
    FEATURE_AI_RESUME_PARSING: bool = True
    FEATURE_AI_MATCHING: bool = True
    FEATURE_JOB_AGGREGATOR: bool = True
    FEATURE_KEYCLOAK_AUTH: bool = True
    SEED_DEMO_DATA: bool = False

    # ── Pagination ────────────────────────────────────────────────────────────
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    def validate_production_settings(self) -> None:
        """Fail fast instead of booting with known development credentials."""
        if not self.is_production:
            return
        errors = []
        if self.SEED_DEMO_DATA:
            errors.append("SEED_DEMO_DATA must not be enabled in production environments")
        if len(self.JWT_SECRET_KEY) < 32 or "dev_secret" in self.JWT_SECRET_KEY:
            errors.append("JWT_SECRET_KEY must be a high-entropy production secret")
        if self.KEYCLOAK_CLIENT_SECRET in {"change-me-in-production", ""}:
            errors.append("KEYCLOAK_CLIENT_SECRET must be configured")
        if self.MINIO_SECRET_KEY in {"minioadmin", "minioadmin_dev_password", ""}:
            errors.append("MINIO_SECRET_KEY must be configured")
        if "*" in self.CORS_ORIGINS:
            errors.append("CORS_ORIGINS must not contain a wildcard in production (combined with allow_credentials=True, this permits credentialed cross-origin requests from any site)")
        if errors:
            raise RuntimeError("Invalid production configuration: " + "; ".join(errors))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
