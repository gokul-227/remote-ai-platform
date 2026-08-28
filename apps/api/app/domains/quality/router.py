"""AI Quality Engine domain — FastAPI router."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from app.agents.quality_engine import QualityEngineAgent
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.quality.schemas import (
    BatchEvaluationRequest,
    BatchQualityReport,
    CodeReviewReport,
    CodeReviewRequest,
    SubmissionEvaluationRequest,
    SubmissionQualityReport,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/quality", tags=["quality"])


def _get_agent() -> QualityEngineAgent:
    return QualityEngineAgent()


@router.post("/evaluate", response_model=SubmissionQualityReport)
async def evaluate_submission(
    body: SubmissionEvaluationRequest,
    current_user: User = Depends(get_current_user),
):
    """
    AI-powered evaluation of a work submission.

    Analyzes the submission against the task description and acceptance criteria,
    returning a quality report with score, grade, verdict, issues, and recommendations.
    """
    agent = _get_agent()
    logger.info(
        "Quality evaluation requested",
        user_id=str(current_user.id),
        task_title=body.task_title[:60],
    )
    report = await agent.evaluate_submission(
        task_title=body.task_title,
        task_description=body.task_description,
        submission_content=body.submission_content,
        requirements=body.requirements,
    )
    return SubmissionQualityReport(**report)


@router.post("/review-code", response_model=CodeReviewReport)
async def review_code(
    body: CodeReviewRequest,
    current_user: User = Depends(get_current_user),
):
    """
    AI-powered technical code review.

    Analyzes a code snippet or diff and returns line-level comments,
    security flags, complexity analysis, and improvement suggestions.
    """
    agent = _get_agent()
    logger.info(
        "Code review requested",
        user_id=str(current_user.id),
        language=body.language,
    )
    report = await agent.review_code(
        task_description=body.task_description,
        code_snippet=body.code_snippet,
        language=body.language,
    )
    return CodeReviewReport(**report)


@router.post("/batch-evaluate", response_model=BatchQualityReport)
async def batch_evaluate(
    body: BatchEvaluationRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Evaluate multiple work submissions in parallel.

    Useful for project managers reviewing a sprint's deliverables.
    Max 10 submissions per request.
    """
    agent = _get_agent()
    logger.info(
        "Batch quality evaluation requested",
        user_id=str(current_user.id),
        count=len(body.submissions),
    )

    raw_submissions = [
        {
            "task_title": s.task_title,
            "task_description": s.task_description,
            "submission_content": s.submission_content,
            "requirements": s.requirements,
        }
        for s in body.submissions
    ]

    results = await agent.batch_evaluate(raw_submissions)
    typed_results = [SubmissionQualityReport(**r) for r in results]
    avg_score = sum(r.overall_score for r in typed_results) / len(typed_results) if typed_results else 0.0

    return BatchQualityReport(
        results=typed_results,
        evaluated=len(typed_results),
        avg_score=round(avg_score, 1),
    )


@router.get("/dashboard")
async def quality_dashboard(current_user: User = Depends(get_current_user)):
    """Quality engine dashboard with status and capabilities."""
    return {
        "status": "operational",
        "agent": "QualityEngineAgent",
        "capabilities": ["submission_evaluation", "code_review", "batch_evaluation"],
        "endpoints": {
            "evaluate": "/api/v1/quality/evaluate",
            "review_code": "/api/v1/quality/review-code",
            "batch_evaluate": "/api/v1/quality/batch-evaluate",
        },
    }


@router.get("/health")
async def quality_engine_health():
    """Check if the AI quality engine is operational."""
    from app.agents.model_config import get_ai_model_config
    from app.core.config import settings

    config = get_ai_model_config()
    has_credentials = bool(settings.AI_API_KEY or settings.GROQ_API_KEY or settings.OPENAI_API_KEY or settings.OLLAMA_BASE_URL)
    return {
        "status": "operational" if has_credentials else "degraded_fallback_mode",
        "agent": "QualityEngineAgent",
        "primary_model": config.primary,
        "fallbacks": list(config.fallbacks),
        "capabilities": ["submission_evaluation", "code_review", "batch_evaluation"],
    }
