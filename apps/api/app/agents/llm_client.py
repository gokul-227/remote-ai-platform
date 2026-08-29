"""
LiteLLM Client Abstraction — supports Ollama (local testing with qwen/deepseek) and OpenAI/Groq (production).
"""

import json
from typing import Any

import litellm

from app.agents.model_config import get_ai_model_config
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("agents.llm_client")

# Configure LiteLLM defaults
litellm.telemetry = False
litellm.drop_params = True


class LLMClient:
    def __init__(self, model_override: str | None = None):
        self.config = get_ai_model_config(model_override)
        self.model = self.config.primary
        self.last_usage: dict[str, Any] = {}
        self.last_error: str | None = None

    @property
    def fallback_models(self) -> list[str]:
        return list(self.config.fallbacks)

    async def complete(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.2,
        json_mode: bool = True,
    ) -> str:
        """Execute completion call via LiteLLM."""
        self.last_usage = {}
        self.last_error = None
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        models = self.config.candidates
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
                usage = getattr(response, "usage", None)
                self.last_usage = {
                    "provider_model": getattr(response, "model", None) or model_name,
                    "prompt_tokens": int(getattr(usage, "prompt_tokens", 0) or 0),
                    "completion_tokens": int(getattr(usage, "completion_tokens", 0) or 0),
                    "total_tokens": int(getattr(usage, "total_tokens", 0) or 0),
                }
                return response.choices[0].message.content or "{}"
            except Exception as exc:
                self.last_error = str(exc)
                logger.warning(
                    "LLM provider failed; trying fallback", model=model_name, error=str(exc)
                )
        return "{}"

    async def complete_with_metadata(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.2,
        json_mode: bool = True,
    ) -> dict[str, Any]:
        """Execute completion and return content along with usage telemetry and success status."""
        content = await self.complete(
            prompt, system_prompt=system_prompt, temperature=temperature, json_mode=json_mode
        )
        is_success = bool(content and content != "{}" and not self.last_error)
        return {
            "success": is_success,
            "content": content,
            "usage": self.last_usage,
            "error": self.last_error if not is_success else None,
            "model": self.last_usage.get("provider_model", self.model),
        }

    async def complete_structured_json(self, prompt: str, system_prompt: str) -> dict[str, Any]:
        """Execute completion call and parse return as Python dictionary."""
        raw_text = await self.complete(prompt, system_prompt=system_prompt, json_mode=True)
        if not raw_text or raw_text == "{}":
            return {}
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
