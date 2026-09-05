"""
Service layer for Engineer Profile management.
"""

import uuid
from collections.abc import Sequence

from fastapi import UploadFile

from app.agents.llm_client import AIProviderError
from app.agents.resume_parser import ResumeParserAgent
from app.core.config import settings
from app.core.exceptions import AIUnavailableException, NotFoundError
from app.core.logging import get_logger
from app.core.security import build_private_resume_object_name, validate_resume_upload
from app.core.storage import generate_presigned_url, get_storage
from app.domains.engineers.models import EngineerProfile
from app.domains.engineers.repository import EngineerRepository
from app.domains.engineers.resume_extraction import extract_resume_text
from app.domains.engineers.schemas import (
    EngineerProfileCreate,
    EngineerProfileResponse,
    EngineerProfileUpdate,
    EngineerSearchQuery,
)
from app.domains.marketplace.models import AIReport
from app.services.ai import AIService

logger = get_logger("engineers.service")

# How long a presigned resume-download link stays valid. Short enough that a
# link leaked via browser history, a referrer header, or a shared screenshot
# is useless soon after; long enough for the page that just requested it to
# actually load the file.
RESUME_URL_EXPIRES_HOURS = 0.25  # 15 minutes


def _resume_object_key(stored_value: str) -> str:
    """Extract the MinIO/S3 object key from a resume_url column value.

    New uploads store the bare object key (see upload_resume() below), but
    existing rows written before presigned URLs were introduced may still
    hold the old permanent, publicly-reachable URL
    (f"{MINIO_PUBLIC_ENDPOINT}/{bucket}/{key}") -- recover the key from
    either shape so both old and new rows can be presigned.
    """
    if stored_value.startswith("http://") or stored_value.startswith("https://"):
        marker = f"/{settings.MINIO_BUCKET_RESUMES}/"
        idx = stored_value.find(marker)
        if idx != -1:
            return stored_value[idx + len(marker) :]
    return stored_value


class EngineerService:
    def __init__(self, repo: EngineerRepository):
        self.repo = repo
        self.storage = get_storage()

    def resume_download_url(self, profile: EngineerProfile) -> str | None:
        """Return a short-lived presigned URL for this profile's resume.

        The object itself lives in a private bucket -- the returned URL is
        the only credential needed to fetch it, so it must be generated
        fresh per request rather than stored/reused indefinitely.
        """
        if not profile.resume_url:
            return None
        key = _resume_object_key(profile.resume_url)
        return generate_presigned_url(
            settings.MINIO_BUCKET_RESUMES, key, expires_hours=RESUME_URL_EXPIRES_HOURS
        )

    def to_response(self, profile: EngineerProfile) -> EngineerProfileResponse:
        """Build the private (owner/admin) profile response.

        Always routes resume_url through resume_download_url() rather than
        serializing the stored column value directly, since the column now
        holds a private object key, not a directly fetchable URL.
        """
        response = EngineerProfileResponse.model_validate(profile)
        response.resume_url = self.resume_download_url(profile)
        return response

    async def get_by_user_id(self, user_id: uuid.UUID) -> EngineerProfile | None:
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
        profile_text = "\n".join(
            [
                profile.headline or "",
                profile.bio or "",
                profile.primary_role or "",
                ", ".join(profile.skills or []),
                str(profile.experience or []),
            ]
        )
        try:
            response = await AIService().improve_profile(profile_text)
        except AIProviderError as exc:
            # This endpoint is an explicit, user-requested AI action (unlike resume-upload's
            # best-effort background parse) -- on total AI failure, surface a clear 503 rather
            # than silently writing placeholder ai_summary/missing_skills that would look like
            # a real enhancement.
            logger.warning(
                "Profile AI enhancement failed; all providers unavailable",
                user_id=str(user_id),
                error=str(exc),
            )
            raise AIUnavailableException(
                "AI profile enhancement is temporarily unavailable. Please retry shortly."
            ) from exc
        summary = response.data.get("summary") or (
            response.reason[0] if response.reason else profile.ai_summary
        )
        profile.ai_summary = summary
        profile.missing_skills = response.recommendations
        fields = [
            profile.headline,
            profile.bio,
            profile.location,
            profile.primary_role,
            profile.skills,
            profile.experience,
            profile.projects,
            profile.resume_url,
        ]
        profile.profile_score = round(sum(bool(value) for value in fields) / len(fields) * 100, 1)
        self.repo.db.add(
            AIReport(
                user_id=user_id, report_type="profile_enhancement", payload=response.model_dump()
            )
        )
        await self.repo.db.flush()
        await self.repo.db.refresh(profile)
        return profile

    async def upload_resume(self, user_id: uuid.UUID, file: UploadFile) -> str:
        """Upload resume PDF to object storage (MinIO) and store reference."""
        profile = await self.repo.get_by_user_id(user_id)
        if not profile:
            raise NotFoundError("Engineer profile not found. Please create a profile first.")

        # Read file content
        file_bytes = await file.read()
        suffix = validate_resume_upload(
            file.filename, file.content_type, file_bytes, settings.MAX_RESUME_SIZE_BYTES
        )
        filename = build_private_resume_object_name(user_id, suffix)
        content_type = file.content_type or "application/pdf"

        # Upload to MinIO. The bucket is private -- callers must never get a
        # permanent, unauthenticated link to someone's resume, so only the
        # object key (not upload_file()'s public-endpoint URL) is persisted;
        # access always goes through a freshly generated, short-lived
        # presigned URL (see resume_download_url()).
        await self.storage.upload_file(
            bucket_name=settings.MINIO_BUCKET_RESUMES,
            object_name=filename,
            data=file_bytes,
            content_type=content_type,
        )

        # Update profile with the private object key
        profile.resume_url = filename
        await self.repo.db.flush()
        logger.info("Uploaded resume for engineer", user_id=str(user_id), object_key=filename)

        # AI-parse inline rather than dispatching a Celery task: this
        # deployment runs no Celery worker (see docs/architecture -- the
        # scheduled-job-sync workflow replaced Celery beat, but nothing ever
        # replaced the worker for on-demand tasks like this one), so a task
        # enqueued via .delay() would sit in Redis forever. Parsing a resume
        # is a single LLM call, already bounded by LLMClient's own
        # timeout/fallback handling, so doing it inline before responding is
        # the honest choice over queuing work nothing will ever pick up.
        # Never let a parsing failure fail the upload itself -- the file is
        # already safely stored at this point.
        resume_text = extract_resume_text(file_bytes, suffix)
        if resume_text:
            try:
                parser = ResumeParserAgent()
                parsed_data = await parser.parse_resume_text(resume_text)
                profile.parsed_resume_data = parsed_data
                if parsed_data.get("headline"):
                    profile.headline = parsed_data["headline"]
                if parsed_data.get("bio"):
                    profile.bio = parsed_data["bio"]
                if parsed_data.get("skills"):
                    profile.skills = list(set((profile.skills or []) + parsed_data["skills"]))
                await self.repo.db.flush()
                logger.info("AI-parsed resume for engineer", user_id=str(user_id))
            except Exception as exc:
                logger.warning(
                    "Resume AI parsing failed; resume upload still succeeded",
                    user_id=str(user_id),
                    error=str(exc),
                )

        return self.resume_download_url(profile) or filename

    async def search_engineers(self, params: EngineerSearchQuery) -> Sequence[EngineerProfile]:
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
