"""
API Router for Unified Search domain.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.engineers.repository import EngineerRepository
from app.domains.engineers.schemas import EngineerPublicProfileResponse
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.schemas import JobPostResponse

router = APIRouter(prefix="/search", tags=["Global Search"])


class GlobalSearchResponse(BaseModel):
    query: str
    total_jobs: int
    total_engineers: int
    jobs: list[JobPostResponse]
    engineers: list[EngineerPublicProfileResponse]


@router.get("", response_model=GlobalSearchResponse)
async def global_search(
    q: str = Query(..., min_length=1, description="Keywords search across jobs and profiles"),
    is_remote: bool = Query(True),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> GlobalSearchResponse:
    """Unified search endpoint returning matched remote jobs and public engineer profiles."""
    job_repo = JobRepository(db)
    engineer_repo = EngineerRepository(db)

    jobs = await job_repo.search(query=q, is_remote=is_remote, skip=skip, limit=limit)
    engineers = await engineer_repo.search(query=q, skip=skip, limit=limit)

    return GlobalSearchResponse(
        query=q,
        total_jobs=len(jobs),
        total_engineers=len(engineers),
        jobs=[JobPostResponse.model_validate(j) for j in jobs],
        engineers=[EngineerPublicProfileResponse.model_validate(e) for e in engineers],
    )
