"""
Repository pattern for Company Profile domain.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.companies.models import CompanyProfile
from app.domains.companies.schemas import CompanyProfileCreate, CompanyProfileUpdate


class CompanyRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, company_id: uuid.UUID) -> CompanyProfile | None:
        stmt = select(CompanyProfile).where(CompanyProfile.id == company_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_user_id(self, user_id: uuid.UUID) -> CompanyProfile | None:
        stmt = select(CompanyProfile).where(CompanyProfile.user_id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, user_id: uuid.UUID, data: CompanyProfileCreate) -> CompanyProfile:
        company = CompanyProfile(
            user_id=user_id,
            name=data.name,
            website=data.website,
            logo_url=data.logo_url,
            description=data.description,
            industry=data.industry,
            company_size=data.company_size,
            location=data.location,
            country=data.country,
            hiring_status=data.hiring_status,
            tech_stack=data.tech_stack,
        )
        self.db.add(company)
        await self.db.flush()
        await self.db.refresh(company)
        return company

    async def update(self, company: CompanyProfile, data: CompanyProfileUpdate) -> CompanyProfile:
        update_dict = data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(company, field, value)
        await self.db.flush()
        await self.db.refresh(company)
        return company

    async def list_companies(
        self, skip: int = 0, limit: int = 20, is_verified: bool | None = None
    ) -> Sequence[CompanyProfile]:
        stmt = select(CompanyProfile)
        if is_verified is not None:
            stmt = stmt.where(CompanyProfile.is_verified == is_verified)
        stmt = stmt.offset(skip).limit(limit).order_by(CompanyProfile.name.asc())
        result = await self.db.execute(stmt)
        return result.scalars().all()
