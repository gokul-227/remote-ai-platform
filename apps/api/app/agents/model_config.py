"""Central AI model and fallback configuration."""

from dataclasses import dataclass

from app.core.config import settings

# LiteLLM model prefix -> settings attribute holding that provider's key.
PROVIDER_KEY_SETTINGS = {
    "groq": "GROQ_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "cerebras": "CEREBRAS_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "openai": "OPENAI_API_KEY",
}


@dataclass(frozen=True)
class AIModelConfig:
    primary: str
    fallbacks: tuple[str, ...]
    timeout_seconds: int
    max_retries: int

    @property
    def candidates(self) -> tuple[str, ...]:
        return (self.primary, *tuple(model for model in self.fallbacks if model != self.primary))


def provider_of(model: str) -> str:
    return model.split("/", 1)[0].lower()


def provider_key(model: str) -> str | None:
    attr = PROVIDER_KEY_SETTINGS.get(provider_of(model))
    return getattr(settings, attr) if attr else None


def api_key_for(model: str) -> str | None:
    """The key LiteLLM should use for `model`.

    A provider's own key always wins, so one provider's key is never sent to
    another; the generic AI_API_KEY is only a fallback for explicit setups.
    """
    return provider_key(model) or settings.AI_API_KEY


def configured_free_tier_models() -> tuple[str, ...]:
    """Models from AI_FREE_TIER_CHAIN whose provider has its own key configured."""
    chain = [m.strip() for m in settings.AI_FREE_TIER_CHAIN.split(",") if m.strip()]
    return tuple(m for m in chain if provider_key(m))


def get_ai_model_config(model_override: str | None = None) -> AIModelConfig:
    provider = model_override or settings.AI_PROVIDER
    if provider == "auto":
        models = configured_free_tier_models()
        return AIModelConfig(
            primary=models[0] if models else "",
            fallbacks=models[1:],
            timeout_seconds=settings.AI_TIMEOUT_SECONDS,
            max_retries=settings.AI_MAX_RETRIES,
        )
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
