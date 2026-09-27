import time
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.llm_client import AIProviderError, AIQuotaExceededError, LLMClient
from app.services.ai.metering import AIQuotaExceeded, reserve_ai_tokens, settle_ai_tokens
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
        """Run an AI completion and normalize it into the provider-neutral `AIResponse` shape.

        Raises `AIProviderError` when every configured provider/fallback failed -- callers must
        not catch this and substitute a look-like-real placeholder `AIResponse`; the honest
        behavior is to propagate it (or catch it explicitly and surface a clear "AI unavailable,
        please retry" error/fallback, as `QualityEngineAgent` does).
        """
        try:
            reservation = await reserve_ai_tokens(prompt_key=prompt_key, prompt_version=prompt_version)
        except AIQuotaExceeded as exc:
            raise AIQuotaExceededError(str(exc)) from exc
        started = time.perf_counter()
        try:
            raw: dict[str, Any] = await self.client.complete_structured_json(prompt, system_prompt)
        except AIProviderError as exc:
            # Record the failure from the exception actually caught, so a FAILED
            # row is never silently mislabeled SUCCESS.
            self.client.last_error = self.client.last_error or str(exc)
            await self._settle(reservation, started)
            raise
        except BaseException:
            await self._settle(reservation, started)
            raise
        await self._settle(reservation, started)
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

    async def _settle(self, reservation: uuid.UUID, started: float) -> None:
        usage = self.client.last_usage
        await settle_ai_tokens(
            reservation,
            provider_model=usage.get("provider_model"),
            status="FAILED" if self.client.last_error and not usage else "SUCCESS",
            latency_ms=int((time.perf_counter() - started) * 1000),
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
            error_message=self.client.last_error if not usage else None,
        )
