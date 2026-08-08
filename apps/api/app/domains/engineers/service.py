"""
Service layer for Engineer Profile management.
"""

import uuid
from typing import Optional, List, Sequence
from fastapi import UploadFile

from app.core.exceptions import NotFoundError, DuplicateError
from app.core.logging import get_logger
from app.core.storage import get_storage
from app.core.config import settings
from app.core.security import build_private_resume_object_name, validate_resume_upload
from app.domains.engineers.models import EngineerProfile
from app.domains.engineers.repository import EngineerRepository
from app.domains.engineers.schemas import (
    EngineerProfileCreate,
    EngineerProfileUpdate,
    EngineerSearchQuery,
)
from app.services.ai import AIService
from app.domains.marketplace.models import AIReport

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

    def _recalculate_score(self, profile: EngineerProfile) -> None:
        fields = [
            profile.headline,
            profile.bio,
            profile.location,
            profile.country,
            profile.timezone,
            profile.primary_role,
            profile.skills,
            profile.experience,
            profile.education,
            profile.github_url or profile.linkedin_url or profile.portfolio_url,
            profile.resume_url,
        ]
        profile.profile_score = round(sum(bool(v) for v in fields) / len(fields) * 100, 1)

    async def create_or_update_profile(
        self, user_id: uuid.UUID, data: EngineerProfileCreate
    ) -> EngineerProfile:
        existing = await self.repo.get_by_user_id(user_id)
        if existing:
            update_data = EngineerProfileUpdate(**data.model_dump())
            profile = await self.repo.update(existing, update_data)
        else:
            profile = await self.repo.create(user_id, data)
        self._recalculate_score(profile)
        await self.repo.db.flush()
        await self.repo.db.refresh(profile)
        return profile

    async def update_profile(
        self, user_id: uuid.UUID, data: EngineerProfileUpdate
    ) -> EngineerProfile:
        profile = await self.repo.get_by_user_id(user_id)
        if not profile:
            raise NotFoundError("Engineer profile not found. Please create one first.")
        updated = await self.repo.update(profile, data)
        self._recalculate_score(updated)
        await self.repo.db.flush()
        await self.repo.db.refresh(updated)
        return updated

    async def enhance_profile(self, user_id: uuid.UUID) -> EngineerProfile:
        profile = await self.repo.get_by_user_id(user_id)
        if not profile:
            raise NotFoundError("Engineer profile not found. Please create a profile first.")
        profile_text = "\n".join([
            profile.headline or "",
            profile.bio or "",
            profile.primary_role or "",
            ", ".join(profile.skills or []),
            str(profile.experience or []),
        ])
        response = await AIService().improve_profile(profile_text)
        summary = response.data.get("summary") or (response.reason[0] if response.reason else profile.ai_summary)
        profile.ai_summary = summary
        profile.missing_skills = response.recommendations
        fields = [profile.headline, profile.bio, profile.location, profile.primary_role, profile.skills, profile.experience, profile.projects, profile.resume_url]
        profile.profile_score = round(sum(bool(value) for value in fields) / len(fields) * 100, 1)
        self.repo.db.add(AIReport(user_id=user_id, report_type="profile_enhancement", payload=response.model_dump()))
        await self.repo.db.flush()
        await self.repo.db.refresh(profile)
        return profile

    async def upload_resume(
        self, user_id: uuid.UUID, file: UploadFile
    ) -> str:
        """Upload resume PDF to object storage (MinIO) and store reference."""
        profile = await self.repo.get_by_user_id(user_id)
        if not profile:
            raise NotFoundError("Engineer profile not found. Please create a profile first.")

        # Read file content
        file_bytes = await file.read()
        suffix = validate_resume_upload(file.filename, file.content_type, file_bytes, settings.MAX_RESUME_SIZE_BYTES)
        filename = build_private_resume_object_name(user_id, suffix)
        content_type = file.content_type or "application/pdf"

        # Upload to MinIO
        resume_url = await self.storage.upload_file(
            bucket_name=settings.MINIO_BUCKET_RESUMES,
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
