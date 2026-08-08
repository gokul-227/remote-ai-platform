from app.agents.model_config import get_ai_model_config
from app.services.ai.prompts import get_prompt


def test_ai_model_config_builds_ordered_provider_candidates(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "AI_PROVIDER", "groq")
    monkeypatch.setattr(settings, "AI_MODEL", "llama-3.1-8b-instant")
    monkeypatch.setattr(settings, "AI_FALLBACK_PROVIDERS", "ollama/qwen2.5,groq/llama-3.1-8b-instant")
    config = get_ai_model_config()

    assert config.candidates == ("groq/llama-3.1-8b-instant", "ollama/qwen2.5")


def test_prompt_registry_exposes_stable_versioned_contract():
    prompt = get_prompt("profile_improvement")
    assert prompt.key == "profile_improvement"
    assert prompt.version == "v1"
    assert "Return only JSON" in prompt.content
