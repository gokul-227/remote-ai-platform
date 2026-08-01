"""
LiteLLM Client Abstraction — supports Ollama (local testing with qwen/deepseek) and OpenAI/Groq (production).
"""

import json
from typing import Dict, Any, Optional
import litellm

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("agents.llm_client")

# Configure LiteLLM defaults
litellm.telemetry = False
litellm.drop_params = True


class LLMClient:
    def __init__(self, model_override: Optional[str] = None):
        provider = model_override or settings.AI_PROVIDER
        self.model = provider if "/" in provider else f"{provider}/{settings.AI_MODEL}"

    @property
    def fallback_models(self) -> list[str]:
        return [model.strip() for model in settings.AI_FALLBACK_PROVIDERS.split(",") if model.strip()]

    async def complete(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.2,
        json_mode: bool = True,
    ) -> str:
        """Execute completion call via LiteLLM."""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        models = [self.model] + [model for model in self.fallback_models if model != self.model]
        for model_name in models:
            try:
                api_base = settings.LITELLM_BASE_URL
                if model_name.startswith("ollama/"):
                    api_base = settings.OLLAMA_BASE_URL
                provider_key = settings.AI_API_KEY
                if not provider_key and model_name.startswith("groq/"):
                    provider_key = settings.GROQ_API_KEY
                if not provider_key and model_name.startswith("openai/"):
                    provider_key = settings.OPENAI_API_KEY
                response = await litellm.acompletion(
                    model=model_name,
                    messages=messages,
                    temperature=temperature,
                    api_key=provider_key,
                    api_base=api_base or None,
                    response_format={"type": "json_object"} if json_mode else None,
                    timeout=settings.AI_TIMEOUT_SECONDS,
                )
                return response.choices[0].message.content or "{}"
            except Exception as exc:
                logger.warning("LLM provider failed; trying fallback", model=model_name, error=str(exc))
        return "{}"

    async def complete_structured_json(
        self, prompt: str, system_prompt: str
    ) -> Dict[str, Any]:
        """Execute completion call and parse return as Python dictionary."""
        raw_text = await self.complete(prompt, system_prompt=system_prompt, json_mode=True)
        try:
            return json.loads(raw_text)
        except json.JSONDecodeError:
            # Fallback extraction using regex if model wraps in markdown backticks
            import re
            match = re.search(r"\{.*\}", raw_text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    pass
            return {}
