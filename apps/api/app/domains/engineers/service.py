"""
Service layer for Engineer Profile management.
"""

import uuid
from typing import Optional, List, Sequence
from fastapi import UploadFile

from app.core.exceptions import NotFoundError, DuplicateError
from app.core.logging import get_logger
from app.core.storage import get_storage
from app.domains.engineers.models import EngineerProfile
from app.domains.engineers.repository import EngineerRepository
from app.domains.engineers.schemas import (
    EngineerProfileCreate,
    EngineerProfileUpdate,
    EngineerSearchQuery,
)

logger = get_logger("engineers.service")


class EngineerService:
    def __init__(self, repo: EngineerRepository):
        self.repo = repo
        self.storage = get_storage()

    async def get_by_user_id(self, user_id: uuid.UUID) -> Optional[EngineerProfile]:
        return await self.repo.get_by_user_id(user_id)

    async def get_by_id(self, profile_id: uuid.UUID) -> EngineerProfile:
        profile = await self.repo.get_by_id(profile_id)
        if not profile:
            raise NotFoundError("Engineer profile not found")
        return profile

    async def create_or_update_profile(
        self, user_id: uuid.UUID, data: EngineerProfileCreate
    ) -> EngineerProfile:
        existing = await self.repo.get_by_user_id(user_id)
        if existing:
            update_data = EngineerProfileUpdate(**data.model_dump())
            return await self.repo.update(existing, update_data)
        return await self.repo.create(user_id, data)

    async def update_profile(
        self, user_id: uuid.UUID, data: EngineerProfileUpdate
    ) -> EngineerProfile:
        profile = await self.repo.get_by_user_id(user_id)
        if not profile:
            raise NotFoundError("Engineer profile not found. Please create one first.")
        return await self.repo.update(profile, data)

    async def upload_resume(
        self, user_id: uuid.UUID, file: UploadFile
    ) -> str:
        """Upload resume PDF to object storage (MinIO) and store reference."""
        profile = await self.repo.get_by_user_id(user_id)
        if not profile:
            raise NotFoundError("Engineer profile not found. Please create a profile first.")

        # Read file content
        file_bytes = await file.read()
        filename = f"resumes/{user_id}/{file.filename}"
        content_type = file.content_type or "application/pdf"

        # Upload to MinIO
        resume_url = await self.storage.upload_file(
            bucket_name="workmesh-resumes",
            object_name=filename,
            data=file_bytes,
            content_type=content_type,
        )

        # Update profile with resume URL
        profile.resume_url = resume_url
        await self.repo.db.flush()
        logger.info("Uploaded resume for engineer", user_id=str(user_id), url=resume_url)
        return resume_url

    async def search_engineers(
        self, params: EngineerSearchQuery
    ) -> Sequence[EngineerProfile]:
        return await self.repo.search(
            query=params.query,
            skills=params.skills,
            min_years_exp=params.min_years_exp,
            primary_role=params.primary_role,
            location=params.location,
            is_open_to_work=params.is_open_to_work,
            skip=params.skip,
            limit=params.limit,
        )
