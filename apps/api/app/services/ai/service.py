import time
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.llm_client import LLMClient
from app.services.ai.models import AIUsageLog
from app.services.ai.prompts import get_prompt
from app.services.ai.schemas import AIResponse


class AIService:
    """Application-facing AI service; provider access stays behind LiteLLM."""

    def __init__(self, model: str | None = None, db: AsyncSession | None = None):
        self.client = LLMClient(model_override=model)
        self.db = db

    async def analyze(
        self,
        prompt: str,
        system_prompt: str,
        prompt_key: str | None = None,
        prompt_version: str | None = None,
    ) -> AIResponse:
        started = time.perf_counter()
        raw: dict[str, Any] = await self.client.complete_structured_json(prompt, system_prompt)
        await self._record_usage(started, prompt_key=prompt_key, prompt_version=prompt_version)
        reason = raw.get("reason", raw.get("summary", ""))
        if isinstance(reason, str):
            reason = [reason] if reason else []
        skills = raw.get("skills_match", raw.get("skills", []))
        experience = raw.get("experience_match", raw.get("experience_level", []))
        if isinstance(experience, str):
            experience = [experience] if experience else []
        recommendations = raw.get("recommendations", raw.get("key_responsibilities", []))
        return AIResponse(
            score=float(raw.get("score", 0) or 0),
            reason=reason or [],
            skills_match=skills or [],
            experience_match=experience or [],
            recommendations=recommendations or [],
            data=raw,
        )

    async def improve_profile(self, profile_text: str) -> AIResponse:
        template = get_prompt("profile_improvement")
        return await self.analyze(
            profile_text,
            template.content,
            prompt_key=template.key,
            prompt_version=template.version,
        )

    async def _record_usage(
        self, started: float, prompt_key: str | None, prompt_version: str | None
    ) -> None:
        if self.db is None:
            return
        usage = self.client.last_usage
        self.db.add(
            AIUsageLog(
                prompt_key=prompt_key,
                prompt_version=prompt_version,
                provider_model=usage.get("provider_model"),
                status="FAILED" if self.client.last_error and not usage else "SUCCESS",
                latency_ms=int((time.perf_counter() - started) * 1000),
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
                error_message=self.client.last_error if not usage else None,
            )
        )
        await self.db.flush()
