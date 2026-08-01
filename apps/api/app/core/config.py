"""
Application Configuration — Pydantic Settings
All configuration is loaded from environment variables or .env file.
"""

from functools import lru_cache
from typing import List, Optional

from pydantic import AnyHttpUrl, field_validator
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
    APP_NAME: str = "WorkMesh AI"
    APP_VERSION: str = "0.1.0"
    APP_URL: str = "http://localhost:3000"
    API_URL: str = "http://localhost:8000"
    DEBUG: bool = False

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://localhost:8080",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    # ── Database ───────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://workmesh:workmesh_dev_password@localhost:5432/workmesh"
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
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin_dev_password"
    MINIO_BUCKET_RESUMES: str = "workmesh-resumes"
    MINIO_BUCKET_ASSETS: str = "workmesh-assets"
    MINIO_SECURE: bool = False

    # ── Keycloak ──────────────────────────────────────────────────────────────
    KEYCLOAK_URL: str = "http://localhost:8080"
    KEYCLOAK_REALM: str = "workmesh"
    KEYCLOAK_CLIENT_ID: str = "workmesh-api"
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

    AI_PROVIDER: str = "ollama/qwen2.5"
    AI_MAX_RETRIES: int = 3
    AI_TIMEOUT_SECONDS: int = 60

    # Optional: production AI providers via LiteLLM
    GROQ_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None

    # ── Job Aggregator ────────────────────────────────────────────────────────
    REMOTEOK_API_URL: str = "https://remoteok.com/api"
    ARBEITNOW_API_URL: str = "https://www.arbeitnow.com/api/job-board-api"
    REMOTIVE_API_URL: str = "https://remotive.com/api/remote-jobs"
    USAJOBS_API_URL: str = "https://data.usajobs.gov/api/search"
    USAJOBS_USER_AGENT: str = "WorkMeshAI/0.1 (admin@workmesh.ai)"
    USAJOBS_AUTH_KEY: Optional[str] = None
    THEMUSE_API_URL: str = "https://www.themuse.com/api/public/jobs"

    JOB_SYNC_SCHEDULE: str = "0 */6 * * *"  # Every 6 hours
    JOB_SYNC_MAX_PER_SOURCE: int = 500

    # ── Feature Flags ─────────────────────────────────────────────────────────
    FEATURE_AI_RESUME_PARSING: bool = True
    FEATURE_AI_MATCHING: bool = True
    FEATURE_JOB_AGGREGATOR: bool = True
    FEATURE_KEYCLOAK_AUTH: bool = True

    # ── Pagination ────────────────────────────────────────────────────────────
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
