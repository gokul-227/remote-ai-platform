"""
API Router for Engineer Profile domain.
"""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import ALLOWED_RESUME_TYPES
from app.domains.auth.dependencies import get_current_user, get_optional_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.engineers.repository import EngineerRepository
from app.domains.engineers.schemas import (
    EngineerProfileCreate,
    EngineerProfileResponse,
    EngineerProfileUpdate,
    EngineerPublicProfileResponse,
    EngineerSearchQuery,
    ResumeUploadResponse,
)
from app.domains.engineers.service import EngineerService

router = APIRouter(prefix="/engineers", tags=["Engineer Profiles"])


async def get_engineer_service(db: AsyncSession = Depends(get_db)) -> EngineerService:
    repo = EngineerRepository(db)
    return EngineerService(repo)


@router.get("", response_model=list[EngineerPublicProfileResponse])
async def list_engineers(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    service: EngineerService = Depends(get_engineer_service),
) -> list[EngineerPublicProfileResponse]:
    """List public engineer profiles for company dashboards."""
    params = EngineerSearchQuery(skip=skip, limit=limit)
    results = await service.search_engineers(params)
    return [EngineerPublicProfileResponse.model_validate(profile) for profile in results]


@router.get("/me", response_model=EngineerProfileResponse)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    service: EngineerService = Depends(get_engineer_service),
) -> EngineerProfileResponse:
    """Get profile of currently logged-in engineer."""
    profile = await service.get_by_user_id(current_user.id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found. Please create a profile.",
        )
    return EngineerProfileResponse.model_validate(profile)


@router.post("/me", response_model=EngineerProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_my_profile(
    data: EngineerProfileCreate,
    current_user: User = Depends(require_role(UserRole.ENGINEER, UserRole.ADMIN)),
    service: EngineerService = Depends(get_engineer_service),
) -> EngineerProfileResponse:
    """Create or replace profile for current engineer."""
    profile = await service.create_or_update_profile(current_user.id, data)
    return EngineerProfileResponse.model_validate(profile)


@router.put("/me", response_model=EngineerProfileResponse)
async def update_my_profile(
    data: EngineerProfileUpdate,
    current_user: User = Depends(require_role(UserRole.ENGINEER, UserRole.ADMIN)),
    service: EngineerService = Depends(get_engineer_service),
) -> EngineerProfileResponse:
    """Update profile fields for current engineer."""
    profile = await service.update_profile(current_user.id, data)
    return EngineerProfileResponse.model_validate(profile)


@router.post("/me/ai-enhance", response_model=EngineerProfileResponse)
async def enhance_my_profile(
    current_user: User = Depends(get_current_user),
    service: EngineerService = Depends(get_engineer_service),
) -> EngineerProfileResponse:
    """Analyze the saved profile through the provider-neutral AI service."""
    profile = await service.enhance_profile(current_user.id)
    return EngineerProfileResponse.model_validate(profile)


@router.post("/me/resume", response_model=ResumeUploadResponse)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    service: EngineerService = Depends(get_engineer_service),
) -> ResumeUploadResponse:
    """Upload resume PDF document to S3/MinIO for current engineer."""
    filename = (file.filename or "").lower()
    if not filename or not (filename.endswith(".pdf") or filename.endswith(".docx")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File format not supported. Upload PDF or DOCX.",
        )
    if file.content_type not in ALLOWED_RESUME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported content type"
        )
    try:
        resume_url = await service.upload_resume(current_user.id, file)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return ResumeUploadResponse(resume_url=resume_url)


@router.get("/search", response_model=list[EngineerPublicProfileResponse])
async def search_engineers(
    query: str | None = Query(None, description="Keywords search"),
    skills: list[str] | None = Query(None, description="Match any listed skill"),
    min_years_exp: int | None = Query(None, ge=0),
    primary_role: str | None = Query(None),
    location: str | None = Query(None),
    is_open_to_work: bool = Query(True),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    service: EngineerService = Depends(get_engineer_service),
) -> list[EngineerPublicProfileResponse]:
    """Search public engineer profiles (for companies & admins)."""
    search_params = EngineerSearchQuery(
        query=query,
        skills=[skill.strip() for skill in skills or [] if skill.strip()] or None,
        min_years_exp=min_years_exp,
        primary_role=primary_role,
        location=location,
        is_open_to_work=is_open_to_work,
        skip=skip,
        limit=limit,
    )
    results = await service.search_engineers(search_params)
    return [EngineerPublicProfileResponse.model_validate(p) for p in results]


@router.get("/{profile_id}", response_model=EngineerProfileResponse | EngineerPublicProfileResponse)
async def get_engineer_by_id(
    profile_id: uuid.UUID,
    current_user: User | None = Depends(get_optional_user),
    service: EngineerService = Depends(get_engineer_service),
) -> EngineerProfileResponse | EngineerPublicProfileResponse:
    """Get public engineer profile by ID.

    The profile itself is visible to anonymous callers (public directory
    browsing), but resume_url/parsed_resume_data are private -- only the
    profile owner or an admin may see them, matching EngineerPublicProfileResponse's
    use everywhere else (list/search). Any other caller, authenticated or not,
    must never be able to harvest another engineer's resume data this way.
    """
    profile = await service.get_by_id(profile_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engineer profile not found")
    is_owner_or_admin = current_user is not None and (
        current_user.id == profile.user_id or current_user.role == UserRole.ADMIN
    )
    if is_owner_or_admin:
        return EngineerProfileResponse.model_validate(profile)
    return EngineerPublicProfileResponse.model_validate(profile)
