"""Tests for the AI Quality Engine domain."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.domains.quality.schemas import (
    SubmissionEvaluationRequest,
    CodeReviewRequest,
    BatchEvaluationRequest,
)


# ── Schema validation ─────────────────────────────────────────────────────────

class TestSubmissionEvaluationRequest:
    def test_valid_request(self):
        req = SubmissionEvaluationRequest(
            task_title="Build REST API",
            task_description="Create a CRUD API for user management",
            submission_content="Here is the implemented API with FastAPI...",
        )
        assert req.task_title == "Build REST API"
        assert req.requirements is None

    def test_with_requirements(self):
        req = SubmissionEvaluationRequest(
            task_title="Build REST API",
            task_description="Create API",
            submission_content="Implementation...",
            requirements=["Must have auth", "Must have pagination"],
        )
        assert len(req.requirements) == 2

    def test_empty_title_raises(self):
        with pytest.raises(Exception):
            SubmissionEvaluationRequest(
                task_title="",
                task_description="desc",
                submission_content="content",
            )


class TestCodeReviewRequest:
    def test_valid_request(self):
        req = CodeReviewRequest(
            task_description="Implement user auth",
            code_snippet="def login(username, password):\n    pass",
            language="python",
        )
        assert req.language == "python"

    def test_default_language(self):
        req = CodeReviewRequest(
            task_description="Implement feature",
            code_snippet="const x = 1;",
        )
        assert req.language == "python"


class TestBatchEvaluationRequest:
    def test_valid_batch(self):
        req = BatchEvaluationRequest(
            submissions=[
                SubmissionEvaluationRequest(
                    task_title=f"Task {i}",
                    task_description="desc",
                    submission_content="content",
                )
                for i in range(3)
            ]
        )
        assert len(req.submissions) == 3

    def test_empty_batch_raises(self):
        with pytest.raises(Exception):
            BatchEvaluationRequest(submissions=[])


# ── Agent logic tests ─────────────────────────────────────────────────────────

class TestQualityEngineAgent:
    def _make_ai_result(self, **kwargs):
        result = MagicMock()
        result.data = {
            "overall_score": 85,
            "grade": "B+",
            "verdict": "approved",
            "summary": "Good work.",
            "dimensions": {},
            "issues": [],
            "strengths": ["Clean code"],
            "recommended_actions": [],
            "requires_revision": False,
            "revision_notes": None,
            **kwargs,
        }
        return result

    @pytest.mark.asyncio
    async def test_evaluate_submission_success(self):
        """QualityEngineAgent returns structured report from LLM response."""
        from app.agents.quality_engine import QualityEngineAgent

        agent = QualityEngineAgent()
        mock_result = self._make_ai_result(overall_score=90, grade="A-", verdict="approved")

        with patch.object(agent.ai, "analyze", new_callable=AsyncMock) as mock_analyze:
            mock_analyze.return_value = mock_result
            report = await agent.evaluate_submission(
                task_title="Build API",
                task_description="Create REST API",
                submission_content="```python\nfrom fastapi import FastAPI\napp = FastAPI()\n```",
                requirements=["Must have health endpoint"],
            )

        assert report["overall_score"] == 90
        assert report["grade"] == "A-"
        assert report["verdict"] == "approved"
        assert mock_analyze.called

    @pytest.mark.asyncio
    async def test_evaluate_submission_fallback_on_error(self):
        """Returns fallback report when LLM call fails."""
        from app.agents.quality_engine import QualityEngineAgent

        agent = QualityEngineAgent()

        with patch.object(agent.ai, "analyze", new_callable=AsyncMock) as mock_analyze:
            mock_analyze.side_effect = Exception("LLM unavailable")
            report = await agent.evaluate_submission(
                task_title="Build API",
                task_description="Create REST API",
                submission_content="some content",
            )

        assert report["verdict"] == "approved_with_notes"
        assert report["overall_score"] == 70
        assert any("unavailable" in issue["description"].lower() for issue in report["issues"])

    @pytest.mark.asyncio
    async def test_review_code_success(self):
        """Code review returns structured report."""
        from app.agents.quality_engine import QualityEngineAgent

        agent = QualityEngineAgent()
        mock_result = MagicMock()
        mock_result.data = {
            "overall_score": 88,
            "grade": "B+",
            "verdict": "approved_with_notes",
            "summary": "Good code.",
            "line_comments": [{"line": 10, "severity": "info", "comment": "Add docstring"}],
            "security_flags": [],
            "complexity_analysis": {"cyclomatic_complexity": "low"},
            "suggestions": [],
            "requires_revision": False,
        }

        with patch.object(agent.ai, "analyze", new_callable=AsyncMock) as mock_analyze:
            mock_analyze.return_value = mock_result
            report = await agent.review_code(
                task_description="Implement user auth",
                code_snippet="def login():\n    pass",
                language="python",
            )

        assert report["overall_score"] == 88
        assert len(report["line_comments"]) == 1

    @pytest.mark.asyncio
    async def test_review_code_fallback_on_error(self):
        """Code review returns fallback on LLM error."""
        from app.agents.quality_engine import QualityEngineAgent

        agent = QualityEngineAgent()

        with patch.object(agent.ai, "analyze", new_callable=AsyncMock) as mock_analyze:
            mock_analyze.side_effect = RuntimeError("Connection error")
            report = await agent.review_code(
                task_description="Task",
                code_snippet="const x = 1;",
                language="javascript",
            )

        assert report["verdict"] == "approved_with_notes"
        assert report["line_comments"] == []

    @pytest.mark.asyncio
    async def test_batch_evaluate(self):
        """Batch evaluation processes multiple submissions concurrently."""
        from app.agents.quality_engine import QualityEngineAgent

        agent = QualityEngineAgent()

        call_count = 0

        async def mock_analyze(prompt, system_prompt=None):
            nonlocal call_count
            call_count += 1
            result = MagicMock()
            result.data = {
                "overall_score": 75 + call_count,
                "grade": "C+",
                "verdict": "approved",
                "summary": "OK",
                "dimensions": {},
                "issues": [],
                "strengths": [],
                "recommended_actions": [],
                "requires_revision": False,
                "revision_notes": None,
            }
            return result

        with patch.object(agent.ai, "analyze", new_callable=AsyncMock, side_effect=mock_analyze):
            results = await agent.batch_evaluate([
                {"task_title": "Task 1", "task_description": "desc", "submission_content": "content"},
                {"task_title": "Task 2", "task_description": "desc", "submission_content": "content"},
            ])

        assert len(results) == 2
        assert call_count == 2


# ── Fallback tests ────────────────────────────────────────────────────────────

class TestFallbacks:
    def test_fallback_report_structure(self):
        from app.agents.quality_engine import QualityEngineAgent
        report = QualityEngineAgent._fallback_report("My Task")
        assert report["overall_score"] == 70
        assert "issues" in report
        assert "strengths" in report
        assert report["requires_revision"] is False

    def test_fallback_code_review_structure(self):
        from app.agents.quality_engine import QualityEngineAgent
        report = QualityEngineAgent._fallback_code_review()
        assert "line_comments" in report
        assert "security_flags" in report
        assert report["requires_revision"] is False


# ── Router endpoint tests ─────────────────────────────────────────────────────

class TestQualityRouterEndpoints:
    @pytest.mark.asyncio
    async def test_health_endpoint_returns_operational(self):
        from app.domains.quality.router import quality_engine_health
        result = await quality_engine_health()
        assert result["status"] in ("operational", "degraded_fallback_mode")
        assert "code_review" in result["capabilities"]

    @pytest.mark.asyncio
    async def test_evaluate_endpoint_uses_agent(self):
        from app.domains.quality.router import evaluate_submission

        mock_user = MagicMock()
        mock_user.id = "test-user-id"

        expected_report = {
            "overall_score": 88,
            "grade": "B+",
            "verdict": "approved",
            "summary": "Solid work.",
            "dimensions": {},
            "issues": [],
            "strengths": ["Good structure"],
            "recommended_actions": [],
            "requires_revision": False,
            "revision_notes": None,
        }

        with patch("app.domains.quality.router.QualityEngineAgent") as MockAgent:
            instance = MockAgent.return_value
            instance.evaluate_submission = AsyncMock(return_value=expected_report)

            body = SubmissionEvaluationRequest(
                task_title="Build REST API",
                task_description="Build an API",
                submission_content="Here is my implementation...",
            )
            result = await evaluate_submission(body=body, current_user=mock_user)

        assert result.overall_score == 88
        assert result.verdict == "approved"
