"""
Tests for Phase 9 AI reliability/governance hardening.

Covers the real gaps found in an audit of app/agents/llm_client.py and its callers:

1. "Silent fake success": previously, when every provider/fallback failed,
   `LLMClient.complete()` returned the literal string "{}" and
   `complete_structured_json()` returned `{}` -- indistinguishable from a genuine (if sparse)
   model response. `AIService.analyze()` then built a normal-looking `AIResponse` out of that
   empty dict, and `ResumeParserAgent`/`JobEnricherAgent` filled it with placeholder defaults
   (e.g. `headline: "Software Engineer"`, `experience_level: "mid"`) that got written straight
   into a user's profile / a job's `ai_analysis` and presented as a real AI result -- with no
   error surfaced anywhere. Now, total failure raises `AIProviderError`, and callers either
   propagate it (`ResumeParserAgent`, `JobEnricherAgent`, `AIService.analyze`), map it to an
   honest 503 (`EngineerService.enhance_profile`), or record an explicit
   `{"status": "unavailable"}` marker instead of fabricated analysis (`JobService.create_job`).
   `LLMClient.complete_with_metadata()` (unused elsewhere, but part of the public contract)
   still never raises -- it reports `success: False` instead.

2. Cost/token observability: `LLMClient.complete()` now logs model, prompt/completion/total
   token counts, and an estimated cost (via `litellm.completion_cost`) at INFO level on every
   successful completion.

3. AI-specific rate limiting: `/engineers/me/resume`, `/engineers/me/ai-enhance`, job creation
   (POST /jobs, not GET), and submission AI review were previously bucketed into the loosest
   general-API tier despite each triggering a real per-call LLM cost. They're now on the same
   tier as `/quality` and `/matching`.

4. Timeout: `litellm.acompletion` already received `timeout=settings.AI_TIMEOUT_SECONDS` before
   this pass -- verified, not re-added.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.job_enricher import JobEnricherAgent
from app.agents.llm_client import AIProviderError, LLMClient
from app.agents.resume_parser import ResumeParserAgent
from app.core.rate_limiter import get_route_tier
from app.domains.auth.models import User, UserRole
from app.services.ai import AIService
from app.services.ai.models import AIUsageLog


class _FakeUsage:
    def __init__(self, prompt_tokens=10, completion_tokens=5, total_tokens=15):
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.total_tokens = total_tokens


class _FakeMessage:
    def __init__(self, content):
        self.content = content


class _FakeChoice:
    def __init__(self, content):
        self.message = _FakeMessage(content)


class _FakeResponse:
    def __init__(self, content, model="groq/llama-3.1-8b-instant"):
        self.choices = [_FakeChoice(content)]
        self.usage = _FakeUsage()
        self.model = model


# ---------------------------------------------------------------------------
# 1. Silent fake success -- LLMClient / AIProviderError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_complete_raises_ai_provider_error_when_every_model_fails(monkeypatch):
    """Total provider failure must be a clear exception, never a quiet '{}' response."""
    import litellm

    async def always_fail(*args, **kwargs):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(litellm, "acompletion", always_fail)

    client = LLMClient()
    with pytest.raises(AIProviderError):
        await client.complete("prompt", system_prompt="system")
    assert client.last_error is not None


@pytest.mark.asyncio
async def test_complete_structured_json_raises_on_total_failure_not_empty_dict(monkeypatch):
    import litellm

    async def always_fail(*args, **kwargs):
        raise RuntimeError("timeout")

    monkeypatch.setattr(litellm, "acompletion", always_fail)

    client = LLMClient()
    with pytest.raises(AIProviderError):
        await client.complete_structured_json("prompt", "system")


@pytest.mark.asyncio
async def test_complete_succeeds_via_fallback_and_clears_prior_error(monkeypatch):
    """Regression guard: last_error must not linger from an earlier-in-loop failure once a
    later fallback model succeeds -- otherwise success gets misreported as failure."""
    import litellm

    from app.agents import model_config as model_config_module
    from app.core.config import settings

    monkeypatch.setattr(settings, "AI_PROVIDER", "groq")
    monkeypatch.setattr(settings, "AI_MODEL", "primary-model")
    monkeypatch.setattr(settings, "AI_FALLBACK_PROVIDERS", "ollama/fallback-model")

    calls = {"count": 0}

    async def first_fails_then_succeeds(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("primary down")
        return _FakeResponse('{"score": 42}', model="ollama/fallback-model")

    monkeypatch.setattr(litellm, "acompletion", first_fails_then_succeeds)
    monkeypatch.setattr(litellm, "completion_cost", lambda completion_response: 0.001)

    client = LLMClient()
    content = await client.complete("prompt", system_prompt="system")
    assert content == '{"score": 42}'
    assert client.last_error is None
    assert client.last_usage["provider_model"] == "ollama/fallback-model"


@pytest.mark.asyncio
async def test_complete_with_metadata_reports_failure_without_raising(monkeypatch):
    """complete_with_metadata's contract is 'always returns a dict' -- it must translate
    AIProviderError into success=False rather than propagating it."""
    import litellm

    async def always_fail(*args, **kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr(litellm, "acompletion", always_fail)

    client = LLMClient()
    result = await client.complete_with_metadata("prompt", system_prompt="system")
    assert result["success"] is False
    assert result["error"]
    assert result["content"] == ""


@pytest.mark.asyncio
async def test_ai_service_analyze_propagates_total_failure(monkeypatch, db: AsyncSession):
    """AIService.analyze() must not swallow total AI failure into an empty-but-valid-looking
    AIResponse; it should raise, and still record a FAILED usage row for observability."""

    async def always_fail(self, prompt, system_prompt):
        raise AIProviderError("all providers failed")

    monkeypatch.setattr(LLMClient, "complete_structured_json", always_fail)

    service = AIService(db=db)
    with pytest.raises(AIProviderError):
        await service.analyze("some prompt", "some system prompt", prompt_key="test_key")

    rows = (await db.execute(AIUsageLog.__table__.select())).fetchall()
    assert len(rows) == 1
    assert rows[0].status == "FAILED"
    assert rows[0].error_message


@pytest.mark.asyncio
async def test_resume_parser_propagates_ai_failure_instead_of_placeholder_profile(monkeypatch):
    """Previously: total AI failure produced {'headline': 'Software Engineer', 'bio': '', ...}
    -- a fabricated profile indistinguishable from a real parse. Now it must raise."""

    async def always_fail(self, prompt, system_prompt):
        raise AIProviderError("all providers failed")

    monkeypatch.setattr(LLMClient, "complete_structured_json", always_fail)

    with pytest.raises(AIProviderError):
        await ResumeParserAgent().parse_resume_text("Some resume text")


@pytest.mark.asyncio
async def test_job_enricher_propagates_ai_failure_instead_of_placeholder_analysis(monkeypatch):
    async def always_fail(self, prompt, system_prompt):
        raise AIProviderError("all providers failed")

    monkeypatch.setattr(LLMClient, "complete_structured_json", always_fail)

    with pytest.raises(AIProviderError):
        await JobEnricherAgent().enrich_job("Backend Engineer", "Build APIs")


@pytest.mark.asyncio
async def test_ai_enhance_endpoint_returns_503_not_fake_profile_when_ai_down(
    client: AsyncClient, test_user: User, auth_headers: dict, db: AsyncSession, monkeypatch
):
    """The user-facing /me/ai-enhance action must surface a clear 'AI unavailable' error
    instead of silently writing a placeholder ai_summary that looks like a real enhancement."""
    from app.domains.engineers.models import EngineerProfile

    profile = EngineerProfile(
        id=uuid.uuid4(),
        user_id=test_user.id,
        headline="Backend Engineer",
        bio="Some bio",
        skills=["Python"],
    )
    db.add(profile)
    await db.commit()

    async def always_fail(self, prompt, system_prompt, prompt_key=None, prompt_version=None):
        raise AIProviderError("all providers failed")

    monkeypatch.setattr(AIService, "analyze", always_fail)

    res = await client.post("/api/v1/engineers/me/ai-enhance", headers=auth_headers)
    assert res.status_code == 503
    assert "unavailable" in res.json()["error"].lower()


@pytest.mark.asyncio
async def test_job_creation_succeeds_with_honest_unavailable_status_when_ai_down(
    client: AsyncClient, test_user: User, auth_headers: dict, db: AsyncSession, monkeypatch
):
    """Job creation must not fail just because AI enrichment is down (the job post is already
    valid), but it must record an honest 'unavailable' marker rather than fabricated
    skills/experience-level data that looks like a real AI extraction."""
    test_user.role = UserRole.ADMIN
    await db.commit()

    async def always_fail(self, title, description):
        raise AIProviderError("all providers failed")

    monkeypatch.setattr(JobEnricherAgent, "enrich_job", always_fail)

    res = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Senior Backend Engineer",
            "description": "Build and scale APIs",
            "company_name": "Acme Corp",
        },
        headers=auth_headers,
    )
    assert res.status_code == 201
    body = res.json()
    assert body["ai_analysis"]["status"] == "unavailable"


# ---------------------------------------------------------------------------
# 2. Cost/token observability
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_successful_completion_records_usage_and_cost(monkeypatch):
    import litellm

    async def fake_acompletion(*args, **kwargs):
        return _FakeResponse('{"ok": true}')

    monkeypatch.setattr(litellm, "acompletion", fake_acompletion)
    monkeypatch.setattr(litellm, "completion_cost", lambda completion_response: 0.00042)

    client = LLMClient()
    await client.complete("prompt", system_prompt="system")

    assert client.last_usage["prompt_tokens"] == 10
    assert client.last_usage["completion_tokens"] == 5
    assert client.last_usage["total_tokens"] == 15
    assert client.last_usage["cost_usd"] == 0.00042
    assert client.last_error is None


@pytest.mark.asyncio
async def test_cost_estimation_failure_does_not_fail_the_completion(monkeypatch):
    """litellm.completion_cost has no pricing data for some models (e.g. local Ollama) --
    that must degrade to cost_usd=None, never break the actual completion."""
    import litellm

    async def fake_acompletion(*args, **kwargs):
        return _FakeResponse('{"ok": true}')

    def raise_unpriced(*args, **kwargs):
        raise Exception("model not mapped for cost calculation")

    monkeypatch.setattr(litellm, "acompletion", fake_acompletion)
    monkeypatch.setattr(litellm, "completion_cost", raise_unpriced)

    client = LLMClient()
    content = await client.complete("prompt", system_prompt="system")
    assert content == '{"ok": true}'
    assert client.last_usage["cost_usd"] is None


# ---------------------------------------------------------------------------
# 3. AI-specific rate limiting
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/api/v1/engineers/me/resume"),
        ("POST", "/api/v1/engineers/me/ai-enhance"),
        ("POST", "/api/v1/jobs"),
        ("POST", "/api/v1/projects/submissions/00000000-0000-0000-0000-000000000000/ai-review"),
        ("GET", "/api/v1/quality/dashboard"),
    ],
)
def test_ai_calling_endpoints_get_the_restrictive_ai_tier(method, path):
    from app.core.config import settings

    general_tier = get_route_tier("/api/v1/engineers", method="GET")
    ai_tier = get_route_tier(path, method=method)
    assert ai_tier is not None
    assert ai_tier[0] == settings.RATE_LIMIT_MAX_REQUESTS * 3
    assert ai_tier[0] < general_tier[0]


def test_job_listing_get_stays_on_the_general_tier_not_the_ai_tier():
    """Only job *creation* (POST) triggers JobEnricherAgent -- job browsing (GET) must not be
    throttled onto the stricter AI tier."""
    from app.core.config import settings

    tier = get_route_tier("/api/v1/jobs", method="GET")
    assert tier[0] == settings.RATE_LIMIT_MAX_REQUESTS * 10


def test_other_submission_routes_stay_on_the_general_tier():
    """Only the /ai-review submission action calls an LLM; plain submission CRUD must not
    share its stricter tier."""
    from app.core.config import settings

    tier = get_route_tier(
        "/api/v1/projects/submissions/00000000-0000-0000-0000-000000000000", method="GET"
    )
    assert tier[0] == settings.RATE_LIMIT_MAX_REQUESTS * 10
