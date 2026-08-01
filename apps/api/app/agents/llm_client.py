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
        self.model = model_override or settings.AI_PROVIDER

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

        try:
            # Format model name for Ollama if running locally
            model_name = self.model
            if model_name.startswith("ollama/"):
                model_name = f"ollama/{model_name.replace('ollama/', '')}"

            response = await litellm.acompletion(
                model=model_name,
                messages=messages,
                temperature=temperature,
                api_base=settings.OLLAMA_BASE_URL if "ollama" in model_name else None,
                response_format={"type": "json_object"} if json_mode else None,
                timeout=settings.AI_TIMEOUT_SECONDS,
            )
            return response.choices[0].message.content or "{}"
        except Exception as e:
            logger.error(f"LLM completion error: {e}", model=self.model)
            # Fallback return empty JSON string
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
