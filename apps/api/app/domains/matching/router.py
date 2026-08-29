"""
API Router for AI Matching domain.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.engineers.models import EngineerProfile
from app.domains.matching.schemas import JobMatchResponse, MatchStatusUpdate
from app.domains.matching.service import MatchingService

router = APIRouter(prefix="/matching", tags=["AI Matching Engine"])


async def get_matching_service(db: AsyncSession = Depends(get_db)) -> MatchingService:
    return MatchingService(db)


@router.get("/recommendations", response_model=list[JobMatchResponse])
async def get_my_job_recommendations(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    service: MatchingService = Depends(get_matching_service),
) -> list[JobMatchResponse]:
    """Get personalized AI-recommended jobs with per-factor match scores for logged-in engineer."""
    matches = await service.get_recommendations_for_engineer(
        current_user.id, skip=skip, limit=limit
    )
    return [JobMatchResponse.model_validate(m) for m in matches]


@router.get("/jobs/{job_id}", response_model=JobMatchResponse)
async def get_my_match_for_job(
    job_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.ENGINEER)),
    service: MatchingService = Depends(get_matching_service),
) -> JobMatchResponse:
    """Get (or compute) the current engineer's AI match breakdown against one specific job —
    powers the "AI Match" panel on the job detail page."""
    match = await service.get_or_compute_match_for_job(current_user.id, job_id)
    return JobMatchResponse.model_validate(match)


@router.get("/candidates/{job_id}", response_model=list[JobMatchResponse])
async def get_candidates_for_job(
    job_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    service: MatchingService = Depends(get_matching_service),
) -> list[JobMatchResponse]:
    """Get top matching engineer candidates for a company's job post."""
    if current_user.role == UserRole.COMPANY:
        job = await service.job_repo.get_by_id(job_id)
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job post not found")
        company = await service.db.scalar(
            select(CompanyProfile).where(CompanyProfile.user_id == current_user.id)
        )
        if not company or job.company_id != company.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view candidates for this job",
            )
    matches = await service.get_top_candidates_for_job(job_id, skip=skip, limit=limit)
    return [JobMatchResponse.model_validate(m) for m in matches]


@router.patch("/{match_id}/status", response_model=JobMatchResponse)
async def update_match_status(
    match_id: uuid.UUID,
    body: MatchStatusUpdate,
    current_user: User = Depends(get_current_user),
    service: MatchingService = Depends(get_matching_service),
) -> JobMatchResponse:
    """Update status of a match (e.g. 'saved', 'applied', 'dismissed')."""
    match_obj = await service.match_repo.get_by_id(match_id)
    if not match_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    engineer = await service.db.get(EngineerProfile, match_obj.engineer_id)
    if not engineer or engineer.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to modify this match"
        )
    match_obj.status = body.status
    await service.db.commit()
    return JobMatchResponse.model_validate(match_obj)
