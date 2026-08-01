"""
API Router for Engineer Profile domain.
"""

import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, File, UploadFile, Query, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.engineers.repository import EngineerRepository
from app.domains.engineers.schemas import (
    EngineerProfileCreate,
    EngineerProfileUpdate,
    EngineerProfileResponse,
    EngineerSearchQuery,
    ResumeUploadResponse,
)
from app.domains.engineers.service import EngineerService

router = APIRouter(prefix="/engineers", tags=["Engineer Profiles"])


async def get_engineer_service(db: AsyncSession = Depends(get_db)) -> EngineerService:
    repo = EngineerRepository(db)
    return EngineerService(repo)


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
    current_user: User = Depends(get_current_user),
    service: EngineerService = Depends(get_engineer_service),
) -> EngineerProfileResponse:
    """Create or replace profile for current engineer."""
    profile = await service.create_or_update_profile(current_user.id, data)
    return EngineerProfileResponse.model_validate(profile)


@router.put("/me", response_model=EngineerProfileResponse)
async def update_my_profile(
    data: EngineerProfileUpdate,
    current_user: User = Depends(get_current_user),
    service: EngineerService = Depends(get_engineer_service),
) -> EngineerProfileResponse:
    """Update profile fields for current engineer."""
    profile = await service.update_profile(current_user.id, data)
    return EngineerProfileResponse.model_validate(profile)


@router.post("/me/resume", response_model=ResumeUploadResponse)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    service: EngineerService = Depends(get_engineer_service),
) -> ResumeUploadResponse:
    """Upload resume PDF document to S3/MinIO for current engineer."""
    if not file.filename or not (file.filename.endswith(".pdf") or file.filename.endswith(".docx")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File format not supported. Upload PDF or DOCX.",
        )
    resume_url = await service.upload_resume(current_user.id, file)
    return ResumeUploadResponse(resume_url=resume_url)


@router.get("/search", response_model=List[EngineerProfileResponse])
async def search_engineers(
    query: Optional[str] = Query(None, description="Keywords search"),
    min_years_exp: Optional[int] = Query(None, ge=0),
    primary_role: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    service: EngineerService = Depends(get_engineer_service),
) -> List[EngineerProfileResponse]:
    """Search public engineer profiles (for companies & admins)."""
    search_params = EngineerSearchQuery(
        query=query,
        min_years_exp=min_years_exp,
        primary_role=primary_role,
        location=location,
        skip=skip,
        limit=limit,
    )
    results = await service.search_engineers(search_params)
    return [EngineerProfileResponse.model_validate(p) for p in results]


@router.get("/{profile_id}", response_model=EngineerProfileResponse)
async def get_engineer_by_id(
    profile_id: uuid.UUID,
    service: EngineerService = Depends(get_engineer_service),
) -> EngineerProfileResponse:
    """Get public engineer profile by ID."""
    profile = await service.get_by_id(profile_id)
    return EngineerProfileResponse.model_validate(profile)
