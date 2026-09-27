"""Free-tier AI provider chain and per-user token allowances (go-live finding E)."""

import asyncio
import uuid
from types import SimpleNamespace

import pytest
from httpx import AsyncClient

from app.core.config import settings


def _fake_response(content: str = '{"summary": "ok"}', tokens: int = 100):
    return SimpleNamespace(
        model="fake",
        usage=SimpleNamespace(prompt_tokens=tokens // 2, completion_tokens=tokens // 2, total_tokens=tokens),
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
    )


@pytest.fixture
def auto_chain(monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER", "auto")
    monkeypatch.setattr(settings, "AI_API_KEY", None)
    monkeypatch.setattr(settings, "AI_FREE_TIER_CHAIN", "groq/a,gemini/b,openrouter/c:free")
    for key in ("GROQ_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "CEREBRAS_API_KEY", "MISTRAL_API_KEY"):
        monkeypatch.setattr(settings, key, None)


def test_auto_chain_skips_providers_without_keys(auto_chain, monkeypatch):
    from app.agents.model_config import get_ai_model_config

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "g")
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "o")
    assert get_ai_model_config().candidates == ("gemini/b", "openrouter/c:free")


@pytest.mark.asyncio
async def test_auto_chain_with_no_keys_fails_fast(auto_chain):
    from app.agents.llm_client import AIProviderError, LLMClient

    with pytest.raises(AIProviderError, match="No AI provider is configured"):
        await LLMClient().complete("hi")


@pytest.mark.asyncio
async def test_each_provider_gets_its_own_key_and_falls_back(auto_chain, monkeypatch):
    import litellm

    from app.agents.llm_client import LLMClient

    monkeypatch.setattr(settings, "GROQ_API_KEY", "groq-key")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "gemini-key")
    seen: list[tuple[str, str]] = []

    async def fake(**kwargs):
        seen.append((kwargs["model"], kwargs["api_key"]))
        if kwargs["model"].startswith("groq/"):
            raise RuntimeError("429 rate limited")
        return _fake_response()

    monkeypatch.setattr(litellm, "acompletion", fake)
    monkeypatch.setattr(litellm, "completion_cost", lambda completion_response: 0)
    assert await LLMClient().complete("hi") == '{"summary": "ok"}'
    assert seen == [("groq/a", "groq-key"), ("gemini/b", "gemini-key")]


@pytest.mark.asyncio
async def test_total_budget_stops_trying_more_models(auto_chain, monkeypatch):
    import litellm

    from app.agents.llm_client import AIProviderError, LLMClient

    monkeypatch.setattr(settings, "GROQ_API_KEY", "k")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "k")
    monkeypatch.setattr(settings, "AI_TOTAL_BUDGET_SECONDS", 1.5)
    calls = []

    async def slow_fail(**kwargs):
        calls.append(kwargs["model"])
        await asyncio.sleep(0.8)
        raise RuntimeError("timeout")

    monkeypatch.setattr(litellm, "acompletion", slow_fail)
    with pytest.raises(AIProviderError):
        await LLMClient().complete("hi")
    assert calls == ["groq/a"]


async def _engineer(client: AsyncClient) -> dict[str, str]:
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"ai_{uuid.uuid4().hex[:8]}@quota-example.com",
            "password": "SecurePass123!",
            "full_name": "Quota User",
            "role": "ENGINEER",
        },
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    await client.post("/api/v1/engineers/me", headers=headers, json={"headline": "Designer", "skills": ["Figma"]})
    return headers


@pytest.mark.asyncio
async def test_usage_is_attributed_and_monthly_allowance_enforced(client: AsyncClient, auto_chain, monkeypatch):
    import litellm

    monkeypatch.setattr(settings, "GROQ_API_KEY", "k")
    monkeypatch.setattr(settings, "AI_FREE_MONTHLY_TOKENS", 150)

    async def ok(**kwargs):
        return _fake_response(tokens=100)

    monkeypatch.setattr(litellm, "acompletion", ok)
    monkeypatch.setattr(litellm, "completion_cost", lambda completion_response: 0)
    headers = await _engineer(client)
    other = await _engineer(client)

    assert (await client.post("/api/v1/engineers/me/ai-enhance", headers=headers)).status_code == 200
    usage = (await client.get("/api/v1/auth/me/ai-usage", headers=headers)).json()
    assert usage == {"used_this_month": 100, "monthly_allowance": 150}

    assert (await client.post("/api/v1/engineers/me/ai-enhance", headers=headers)).status_code == 200
    blocked = await client.post("/api/v1/engineers/me/ai-enhance", headers=headers)
    assert blocked.status_code == 429
    assert "allowance" in blocked.json()["error"]

    # Another user's allowance is independent.
    assert (await client.post("/api/v1/engineers/me/ai-enhance", headers=other)).status_code == 200


@pytest.mark.asyncio
async def test_platform_daily_cap_applies_to_everyone(client: AsyncClient, auto_chain, monkeypatch):
    import litellm

    monkeypatch.setattr(settings, "GROQ_API_KEY", "k")
    monkeypatch.setattr(settings, "AI_GLOBAL_DAILY_TOKENS", 100)

    async def ok(**kwargs):
        return _fake_response(tokens=100)

    monkeypatch.setattr(litellm, "acompletion", ok)
    monkeypatch.setattr(litellm, "completion_cost", lambda completion_response: 0)
    first = await _engineer(client)
    second = await _engineer(client)
    assert (await client.post("/api/v1/engineers/me/ai-enhance", headers=first)).status_code == 200
    capped = await client.post("/api/v1/engineers/me/ai-enhance", headers=second)
    assert capped.status_code == 429
    assert "platform limit" in capped.json()["error"]


@pytest.mark.asyncio
async def test_ai_health_reports_the_configured_chain(client: AsyncClient, auto_chain, monkeypatch):
    from app.core.health import _check_ai_provider

    down = await _check_ai_provider()
    assert down.status == "DOWN"
    monkeypatch.setattr(settings, "GROQ_API_KEY", "k")
    up = await _check_ai_provider()
    assert up.status == "HEALTHY"
    assert up.details == {"providers": ["groq"]}


def test_generic_key_never_overrides_or_enables_other_providers(auto_chain, monkeypatch):
    from app.agents.model_config import api_key_for, get_ai_model_config

    monkeypatch.setattr(settings, "AI_API_KEY", "generic")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "gemini-key")
    assert get_ai_model_config().candidates == ("gemini/b",)
    assert api_key_for("gemini/b") == "gemini-key"


# ── AI-01: reservations ──────────────────────────────────────────────────────


async def _usage_rows():
    from conftest import TestingSessionLocal
    from sqlalchemy import select

    from app.services.ai.models import AIUsageLog

    async with TestingSessionLocal() as db:
        return (await db.scalars(select(AIUsageLog))).all()


@pytest.mark.asyncio
async def test_usage_survives_a_request_that_rolls_back(auto_chain, monkeypatch):
    """Recording usage in the request's own transaction let a request that
    failed after the AI call erase what it spent (an allowance bypass)."""
    import litellm
    from conftest import TestingSessionLocal

    from app.services.ai.metering import set_ai_actor
    from app.services.ai.service import AIService

    monkeypatch.setattr(settings, "GROQ_API_KEY", "k")
    monkeypatch.setattr(litellm, "acompletion", lambda **kw: asyncio.sleep(0, _fake_response(tokens=120)))
    monkeypatch.setattr(litellm, "completion_cost", lambda completion_response: 0)
    before = len(await _usage_rows())
    async with TestingSessionLocal() as request_db:
        set_ai_actor(uuid.uuid4(), request_db)
        await AIService().analyze("x", "y", prompt_key="k")
        await request_db.rollback()  # the request fails after the AI call
    rows = await _usage_rows()
    assert len(rows) == before + 1
    assert rows[-1].status == "SUCCESS" and rows[-1].total_tokens == 120


@pytest.mark.asyncio
async def test_platform_cap_applies_without_a_signed_in_user(auto_chain, monkeypatch):
    from app.agents.llm_client import AIQuotaExceededError
    from app.services.ai import metering
    from app.services.ai.service import AIService

    monkeypatch.setattr(settings, "GROQ_API_KEY", "k")
    monkeypatch.setattr(settings, "AI_GLOBAL_DAILY_TOKENS", 1)
    metering._actor.set(None)
    await metering.reserve_ai_tokens()  # someone used today's budget
    with pytest.raises(AIQuotaExceededError):
        await AIService().analyze("x", "y")


@pytest.mark.asyncio
async def test_a_call_in_flight_counts_against_the_allowance(auto_chain, monkeypatch):
    from conftest import TestingSessionLocal

    from app.services.ai import metering

    monkeypatch.setattr(settings, "AI_FREE_MONTHLY_TOKENS", 1500)
    monkeypatch.setattr(settings, "AI_RESERVATION_TOKENS", 2000)
    async with TestingSessionLocal() as db:
        metering.set_ai_actor(uuid.uuid4(), db)
        await metering.reserve_ai_tokens()  # first call still running
        with pytest.raises(metering.AIQuotaExceeded):
            await metering.reserve_ai_tokens()
