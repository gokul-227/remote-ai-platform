"""
Service layer for Company Profile domain.
"""

import uuid
from collections.abc import Sequence

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.domains.companies.models import CompanyProfile
from app.domains.companies.repository import CompanyRepository
from app.domains.companies.schemas import CompanyProfileCreate, CompanyProfileUpdate

logger = get_logger("companies.service")


class CompanyService:
    def __init__(self, repo: CompanyRepository):
        self.repo = repo

    async def get_by_user_id(self, user_id: uuid.UUID) -> CompanyProfile | None:
        return await self.repo.get_by_user_id(user_id)

    async def get_by_id(self, company_id: uuid.UUID) -> CompanyProfile:
        company = await self.repo.get_by_id(company_id)
        if not company:
            raise NotFoundError("Company profile not found")
        return company

    async def create_or_update_profile(
        self, user_id: uuid.UUID, data: CompanyProfileCreate
    ) -> CompanyProfile:
        existing = await self.repo.get_by_user_id(user_id)
        if existing:
            update_data = CompanyProfileUpdate(**data.model_dump())
            return await self.repo.update(existing, update_data)
        return await self.repo.create(user_id, data)

    async def update_profile(
        self, user_id: uuid.UUID, data: CompanyProfileUpdate
    ) -> CompanyProfile:
        company = await self.repo.get_by_user_id(user_id)
        if not company:
            raise NotFoundError("Company profile not found. Please create one first.")
        return await self.repo.update(company, data)

    async def list_companies(
        self, skip: int = 0, limit: int = 20, is_verified: bool | None = None
    ) -> Sequence[CompanyProfile]:
        return await self.repo.list_companies(skip=skip, limit=limit, is_verified=is_verified)
