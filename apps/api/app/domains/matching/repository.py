"""
Repository pattern for AI Job Matching domain.
"""

import uuid
from typing import Optional, Sequence
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.matching.models import JobMatch


class MatchingRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, match_id: uuid.UUID) -> Optional[JobMatch]:
        stmt = select(JobMatch).where(JobMatch.id == match_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_match(self, engineer_id: uuid.UUID, job_id: uuid.UUID) -> Optional[JobMatch]:
        stmt = select(JobMatch).where(
            JobMatch.engineer_id == engineer_id, JobMatch.job_id == job_id
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
            .options(selectinload(JobMatch.job))
            .where(
                JobMatch.engineer_id == engineer_id,
                JobMatch.overall_score >= min_score,
                JobMatch.status != "dismissed",
            )
            .order_by(JobMatch.overall_score.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def list_top_candidates_for_job(
        self, job_id: uuid.UUID, min_score: float = 60.0, skip: int = 0, limit: int = 20
    ) -> Sequence[JobMatch]:
        stmt = (
            select(JobMatch)
            .options(selectinload(JobMatch.engineer))
            .where(JobMatch.job_id == job_id, JobMatch.overall_score >= min_score)
            .order_by(JobMatch.overall_score.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()
