"""
AI Quality Engine Agent.

Evaluates work submissions for quality, completeness, and delivery standards.
Returns a structured quality report with score, issues, and actionable feedback.
"""

from typing import Any

from app.core.logging import get_logger
from app.services.ai import AIService

logger = get_logger("agents.quality_engine")

QUALITY_SYSTEM_PROMPT = """
You are an expert AI Code & Work Quality Reviewer for a remote engineering marketplace.
Your job is to evaluate a submitted work deliverable and return a quality assessment report.

Analyze the submission against the requirements and return ONLY a valid JSON object with this schema:

{
  "overall_score": 87,
  "grade": "B+",
  "verdict": "approved",
  "summary": "The submission meets most requirements with minor issues in error handling.",
  "dimensions": {
    "completeness": { "score": 90, "note": "All required endpoints implemented." },
    "code_quality": { "score": 85, "note": "Code is clean but lacks type hints in 2 functions." },
    "documentation": { "score": 80, "note": "README present but missing API examples." },
    "testing": { "score": 88, "note": "Good unit test coverage at 78%." },
    "security": { "score": 92, "note": "No obvious vulnerabilities. Input validation present." },
    "performance": { "score": 85, "note": "Queries are indexed. No N+1 issues detected." }
  },
  "issues": [
    { "severity": "warning", "category": "code_quality", "description": "Function `process_payment` has no error handling for network timeouts." },
    { "severity": "info", "category": "documentation", "description": "Add usage examples to README." }
  ],
  "strengths": [
    "Clean architecture with proper separation of concerns",
    "Comprehensive input validation",
    "Well-structured database schema"
  ],
  "recommended_actions": [
    "Add try/except around external API calls in `process_payment`",
    "Include a .env.example file for easier onboarding",
    "Write integration tests for the payment flow"
  ],
  "requires_revision": false,
  "revision_notes": null
}

Verdicts: "approved", "approved_with_notes", "revision_required", "rejected"
Grade scale: A+ (95-100), A (90-94), B+ (85-89), B (80-84), C+ (75-79), C (70-74), D (60-69), F (<60)
severity: "critical", "warning", "info"
Return ONLY valid JSON without markdown wrapping.
"""

CODE_REVIEW_SYSTEM_PROMPT = """
You are a senior software engineer performing a technical code review for a remote engineering marketplace.
Review the provided code diff or snippet against the task description.

Return ONLY a valid JSON object with this schema:

{
  "overall_score": 82,
  "grade": "B",
  "verdict": "approved_with_notes",
  "summary": "Solid implementation with minor style and safety issues.",
  "line_comments": [
    { "line": 42, "severity": "warning", "comment": "This loop has O(n²) complexity. Consider using a dict lookup." },
    { "line": 87, "severity": "info", "comment": "Prefer f-string formatting over .format() for clarity." }
  ],
  "security_flags": [],
  "complexity_analysis": {
    "cyclomatic_complexity": "low",
    "maintainability_index": "high",
    "notes": "Well-structured with small functions."
  },
  "suggestions": [
    "Extract the validation logic into a dedicated validator class",
    "Add docstrings to all public methods"
  ],
  "requires_revision": false
}

Return ONLY valid JSON without markdown wrapping.
"""


class QualityEngineAgent:
    """AI-powered work quality evaluation engine."""

    def __init__(self, model_name: str | None = None):
        self.ai = AIService(model=model_name)

    async def evaluate_submission(
        self,
        task_title: str,
        task_description: str,
        submission_content: str,
        requirements: list[str] | None = None,
    ) -> dict[str, Any]:
        """
        Evaluate a work submission against task requirements.

        Returns a structured quality report with score, grade, verdict, issues, and recommendations.
        """
        req_block = ""
        if requirements:
            req_block = "\n\nAcceptance Criteria:\n" + "\n".join(f"- {r}" for r in requirements)

        prompt = (
            f"Task: {task_title}\n\n"
            f"Description: {task_description[:800]}"
            f"{req_block}\n\n"
            f"Submission:\n{submission_content[:3000]}"
        )

        try:
            result = (await self.ai.analyze(prompt, system_prompt=QUALITY_SYSTEM_PROMPT)).data
        except Exception as exc:
            logger.warning("Quality engine LLM call failed, returning fallback", error=str(exc))
            return self._fallback_report(task_title)

        # Normalize and ensure required keys
        raw_score = (
            result.get("overall_score") or result.get("quality_score") or result.get("score") or 70
        )
        return {
            "overall_score": int(raw_score),
            "grade": result.get("grade", "C+"),
            "verdict": result.get("verdict", "approved_with_notes"),
            "summary": result.get("summary") or result.get("feedback") or "Submission received.",
            "dimensions": result.get("dimensions", {}),
            "issues": result.get("issues", []),
            "strengths": result.get("strengths", []),
            "recommended_actions": result.get("recommended_actions", []),
            "requires_revision": bool(result.get("requires_revision", False)),
            "revision_notes": result.get("revision_notes"),
        }

    async def review_code(
        self,
        task_description: str,
        code_snippet: str,
        language: str = "python",
    ) -> dict[str, Any]:
        """
        Perform a technical code review on a code snippet or diff.

        Returns line-level comments, security flags, and complexity analysis.
        """
        prompt = (
            f"Language: {language}\n\n"
            f"Task Context: {task_description[:500]}\n\n"
            f"Code to Review:\n```{language}\n{code_snippet[:4000]}\n```"
        )

        try:
            result = (await self.ai.analyze(prompt, system_prompt=CODE_REVIEW_SYSTEM_PROMPT)).data
        except Exception as exc:
            logger.warning("Code review LLM call failed, returning fallback", error=str(exc))
            return self._fallback_code_review()

        return {
            "overall_score": int(result.get("overall_score", 70)),
            "grade": result.get("grade", "C+"),
            "verdict": result.get("verdict", "approved_with_notes"),
            "summary": result.get("summary", ""),
            "line_comments": result.get("line_comments", []),
            "security_flags": result.get("security_flags", []),
            "complexity_analysis": result.get("complexity_analysis", {}),
            "suggestions": result.get("suggestions", []),
            "requires_revision": bool(result.get("requires_revision", False)),
        }

    async def batch_evaluate(self, submissions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Evaluate multiple submissions. Each dict must have: task_title, task_description, submission_content."""
        import asyncio

        tasks = [
            self.evaluate_submission(
                task_title=s.get("task_title", "Task"),
                task_description=s.get("task_description", ""),
                submission_content=s.get("submission_content", ""),
                requirements=s.get("requirements"),
            )
            for s in submissions
        ]
        return list(await asyncio.gather(*tasks))

    @staticmethod
    def _fallback_report(task_title: str) -> dict[str, Any]:
        """Returns a neutral fallback report when the LLM is unavailable."""
        return {
            "overall_score": 70,
            "grade": "C+",
            "verdict": "approved_with_notes",
            "summary": f"Automated review of '{task_title}' could not be completed. Manual review required.",
            "dimensions": {},
            "issues": [
                {
                    "severity": "info",
                    "category": "system",
                    "description": "AI review engine temporarily unavailable.",
                }
            ],
            "strengths": [],
            "recommended_actions": ["Request manual review from project lead."],
            "requires_revision": False,
            "revision_notes": None,
        }

    @staticmethod
    def _fallback_code_review() -> dict[str, Any]:
        return {
            "overall_score": 70,
            "grade": "C+",
            "verdict": "approved_with_notes",
            "summary": "Code review engine temporarily unavailable. Manual review recommended.",
            "line_comments": [],
            "security_flags": [],
            "complexity_analysis": {},
            "suggestions": [],
            "requires_revision": False,
        }
