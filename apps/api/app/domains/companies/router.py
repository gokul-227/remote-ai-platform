"""
API Router for Company domain.
"""

import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User, UserRole
from app.domains.companies.repository import CompanyRepository
from app.domains.companies.schemas import (
    CompanyProfileCreate,
    CompanyProfileUpdate,
    CompanyProfileResponse,
)
from app.domains.companies.service import CompanyService

router = APIRouter(prefix="/companies", tags=["Company Profiles"])


async def get_company_service(db: AsyncSession = Depends(get_db)) -> CompanyService:
    repo = CompanyRepository(db)
    return CompanyService(repo)


@router.get("/me", response_model=CompanyProfileResponse)
async def get_my_company(
    current_user: User = Depends(get_current_user),
    service: CompanyService = Depends(get_company_service),
) -> CompanyProfileResponse:
    """Get company profile of currently logged in user."""
    company = await service.get_by_user_id(current_user.id)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company profile not found.",
        )
    return CompanyProfileResponse.model_validate(company)


@router.post("/me", response_model=CompanyProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_my_company(
    data: CompanyProfileCreate,
    current_user: User = Depends(get_current_user),
    service: CompanyService = Depends(get_company_service),
) -> CompanyProfileResponse:
    """Create or update company profile for current user."""
    company = await service.create_or_update_profile(current_user.id, data)
    return CompanyProfileResponse.model_validate(company)


@router.put("/me", response_model=CompanyProfileResponse)
async def update_my_company(
    data: CompanyProfileUpdate,
    current_user: User = Depends(get_current_user),
    service: CompanyService = Depends(get_company_service),
) -> CompanyProfileResponse:
    """Update fields for current company profile."""
    company = await service.update_profile(current_user.id, data)
    return CompanyProfileResponse.model_validate(company)


@router.get("/public", response_model=List[CompanyProfileResponse])
async def list_public_companies(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    is_verified: Optional[bool] = Query(None),
    service: CompanyService = Depends(get_company_service),
) -> List[CompanyProfileResponse]:
    """List public company directory."""
    results = await service.list_companies(skip=skip, limit=limit, is_verified=is_verified)
    return [CompanyProfileResponse.model_validate(c) for c in results]


@router.get("/{company_id}", response_model=CompanyProfileResponse)
async def get_company_by_id(
    company_id: uuid.UUID,
    service: CompanyService = Depends(get_company_service),
) -> CompanyProfileResponse:
    """Get public company profile by ID."""
    company = await service.get_by_id(company_id)
    return CompanyProfileResponse.model_validate(company)
