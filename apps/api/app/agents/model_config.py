"""Central AI model and fallback configuration."""

from dataclasses import dataclass

from app.core.config import settings


@dataclass(frozen=True)
class AIModelConfig:
    primary: str
    fallbacks: tuple[str, ...]
    timeout_seconds: int
    max_retries: int

    @property
    def candidates(self) -> tuple[str, ...]:
        return (self.primary, *tuple(model for model in self.fallbacks if model != self.primary))


def get_ai_model_config(model_override: str | None = None) -> AIModelConfig:
    provider = model_override or settings.AI_PROVIDER
    primary = provider if "/" in provider else f"{provider}/{settings.AI_MODEL}"
    fallbacks = tuple(
        model.strip() for model in settings.AI_FALLBACK_PROVIDERS.split(",") if model.strip()
    )
    return AIModelConfig(
        primary=primary,
        fallbacks=fallbacks,
        timeout_seconds=settings.AI_TIMEOUT_SECONDS,
        max_retries=settings.AI_MAX_RETRIES,
    )
