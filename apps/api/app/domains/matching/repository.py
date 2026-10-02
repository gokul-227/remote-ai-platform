"""
Repository pattern for AI Job Matching domain.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domains.engineers.models import EngineerProfile
from app.domains.jobs.models import JobPost
from app.domains.matching.models import JobMatch


class MatchingRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, match_id: uuid.UUID) -> JobMatch | None:
        stmt = select(JobMatch).where(JobMatch.id == match_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_match(self, engineer_id: uuid.UUID, job_id: uuid.UUID) -> JobMatch | None:
        stmt = (
            select(JobMatch)
            .options(selectinload(JobMatch.job), selectinload(JobMatch.engineer))
            .where(JobMatch.engineer_id == engineer_id, JobMatch.job_id == job_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert_match(
        self,
        engineer_id: uuid.UUID,
        job_id: uuid.UUID,
        overall_score: float,
        skill_score: float,
        experience_score: float,
        role_score: float,
        timezone_score: float,
        availability_score: float,
        compensation_score: float,
        remote_score: float,
        reasoning: str,
        matching_skills: list,
        missing_skills: list,
    ) -> JobMatch:
        existing = await self.get_match(engineer_id, job_id)
        if existing:
            existing.overall_score = overall_score
            existing.skill_score = skill_score
            existing.experience_score = experience_score
            existing.role_score = role_score
            existing.timezone_score = timezone_score
            existing.availability_score = availability_score
            existing.compensation_score = compensation_score
            existing.remote_score = remote_score
            existing.reasoning = reasoning
            existing.matching_skills = matching_skills
            existing.missing_skills = missing_skills
            await self.db.flush()
            return existing

        match_obj = JobMatch(
            engineer_id=engineer_id,
            job_id=job_id,
            overall_score=overall_score,
            skill_score=skill_score,
            experience_score=experience_score,
            role_score=role_score,
            timezone_score=timezone_score,
            availability_score=availability_score,
            compensation_score=compensation_score,
            remote_score=remote_score,
            reasoning=reasoning,
            matching_skills=matching_skills,
            missing_skills=missing_skills,
            status="recommended",
        )
        self.db.add(match_obj)
        await self.db.flush()
        await self.db.refresh(match_obj)
        return match_obj

    async def list_recommendations_for_engineer(
        self, engineer_id: uuid.UUID, min_score: float = 50.0, skip: int = 0, limit: int = 20
    ) -> Sequence[JobMatch]:
        stmt = (
            select(JobMatch)
            .options(selectinload(JobMatch.job), selectinload(JobMatch.engineer))
            .join(JobPost, JobPost.id == JobMatch.job_id)
            # A job hidden by moderation, closed, expired or removed after it was
            # scored must stop being recommended (MATCH-01).
            .where(
                JobMatch.engineer_id == engineer_id,
                JobMatch.overall_score >= min_score,
                JobMatch.status != "dismissed",
                JobPost.is_active.is_(True),
                JobPost.is_deleted.is_(False),
                JobPost.expired_at.is_(None),
            )
            .order_by(JobMatch.overall_score.desc(), JobMatch.job_id)
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def engineer_ids_with_match(self, job_id: uuid.UUID) -> set[uuid.UUID]:
        rows = await self.db.execute(select(JobMatch.engineer_id).where(JobMatch.job_id == job_id))
        return {r[0] for r in rows}

    async def list_top_candidates_for_job(
        self, job_id: uuid.UUID, min_score: float = 60.0, skip: int = 0, limit: int = 20
    ) -> Sequence[JobMatch]:
        stmt = (
            select(JobMatch)
            .options(selectinload(JobMatch.engineer), selectinload(JobMatch.job))
            .join(EngineerProfile, EngineerProfile.id == JobMatch.engineer_id)
            # A match computed while a profile was public must not keep
            # surfacing it to companies after the engineer hides it.
            .where(
                JobMatch.job_id == job_id,
                JobMatch.overall_score >= min_score,
                EngineerProfile.is_public.is_(True),
                EngineerProfile.is_open_to_work.is_(True),
            )
            .order_by(JobMatch.overall_score.desc(), JobMatch.engineer_id)
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()
