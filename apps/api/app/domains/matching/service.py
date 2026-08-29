"""
AI Matching Engine Service — Computes multi-factor score breakdown and explainable AI recommendations.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.domains.engineers.models import EngineerProfile
from app.domains.engineers.repository import EngineerRepository
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository
from app.domains.matching.models import JobMatch
from app.domains.matching.repository import MatchingRepository
from app.services.ai import AIResponse

logger = get_logger("matching.service")


class MatchingService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.match_repo = MatchingRepository(db)
        self.engineer_repo = EngineerRepository(db)
        self.job_repo = JobRepository(db)

    async def calculate_match(self, engineer: EngineerProfile, job: JobPost) -> JobMatch:
        """
        Evaluate multi-factor match score between Engineer profile and Job post.
        """
        eng_skills = {s.lower() for s in (engineer.skills or [])}
        job_skills = {s.lower() for s in (job.skills or [])}

        # 1. Skill Score (0-100)
        matching_skills = [s for s in (job.skills or []) if s.lower() in eng_skills]
        missing_skills = [s for s in (job.skills or []) if s.lower() not in eng_skills]

        if not job_skills:
            skill_score = 75.0
        else:
            skill_score = min(100.0, (len(matching_skills) / max(len(job_skills), 1)) * 100.0)

        # 2. Experience Score (0-100)
        exp_map = {"junior": 1, "mid": 3, "senior": 5, "lead": 8}
        required_exp = exp_map.get((job.experience_level or "mid").lower(), 3)
        candidate_exp = engineer.years_of_experience or 0

        if candidate_exp >= required_exp:
            experience_score = 100.0
        else:
            experience_score = max(40.0, 100.0 - (required_exp - candidate_exp) * 20.0)

        # 3. Role Score (0-100)
        eng_role = (engineer.primary_role or "").lower()
        job_title = (job.title or "").lower()

        if eng_role and eng_role in job_title:
            role_score = 100.0
        elif any(word in job_title for word in eng_role.split() if len(word) > 2):
            role_score = 80.0
        else:
            role_score = 60.0

        # 4. Timezone Score (0-100): compares the job's stated timezone/region
        # constraint against the engineer's timezone, both free-text fields.
        job_tz_pref = (job.remote_preference or "").lower()
        eng_tz = (engineer.timezone or "").lower()
        if not job_tz_pref:
            timezone_score = 100.0  # job has no timezone constraint
        elif not eng_tz:
            timezone_score = 60.0  # constraint exists but engineer's timezone is unknown
        elif eng_tz in job_tz_pref or job_tz_pref in eng_tz:
            timezone_score = 100.0
        else:
            timezone_score = 50.0

        availability_score = 100.0 if engineer.is_open_to_work else 40.0
        compensation_score = 100.0
        if job.budget_max and engineer.hourly_rate and job.budget_max < engineer.hourly_rate:
            compensation_score = 60.0

        # 5. Remote Score (0-100): compares job remote status against the
        # engineer's actual remote-work preference, not just its presence.
        eng_remote_pref = (engineer.remote_preference or "").lower()
        if job.is_remote:
            if not eng_remote_pref or "remote" in eng_remote_pref:
                remote_score = 100.0
            elif "hybrid" in eng_remote_pref:
                remote_score = 70.0
            else:
                remote_score = 50.0
        else:
            if (
                "onsite" in eng_remote_pref
                or "on-site" in eng_remote_pref
                or "in-office" in eng_remote_pref
            ):
                remote_score = 100.0
            elif "hybrid" in eng_remote_pref:
                remote_score = 70.0
            else:
                remote_score = 40.0

        # Weighted Overall Score
        overall_score = round(
            0.40 * skill_score
            + 0.25 * experience_score
            + 0.15 * role_score
            + 0.08 * timezone_score
            + 0.07 * availability_score
            + 0.03 * compensation_score
            + 0.02 * remote_score,
            1,
        )

        # Explainable AI rationale
        rationale_parts = []
        if matching_skills:
            rationale_parts.append(
                f"Matches {len(matching_skills)} key skills ({', '.join(matching_skills[:3])})."
            )
        if candidate_exp >= required_exp:
            rationale_parts.append(
                f"Meets experience criteria ({candidate_exp} yrs vs {required_exp} yrs required)."
            )
        else:
            rationale_parts.append(
                f"Candidate has {candidate_exp} yrs exp (job targets ~{required_exp} yrs)."
            )
        if missing_skills:
            rationale_parts.append(f"Gaps identified in: {', '.join(missing_skills[:2])}.")

        analysis = AIResponse(
            score=overall_score,
            reason=rationale_parts,
            skills_match=matching_skills,
            experience_match=[f"{candidate_exp} years vs {required_exp} required"],
            recommendations=missing_skills,
        )

        # Save to DB
        return await self.match_repo.upsert_match(
            engineer_id=engineer.id,
            job_id=job.id,
            overall_score=overall_score,
            skill_score=round(skill_score, 1),
            experience_score=round(experience_score, 1),
            role_score=round(role_score, 1),
            timezone_score=round(timezone_score, 1),
            availability_score=round(availability_score, 1),
            compensation_score=round(compensation_score, 1),
            remote_score=round(remote_score, 1),
            reasoning=" ".join(analysis.reason),
            matching_skills=analysis.skills_match,
            missing_skills=analysis.recommendations,
        )

    async def get_recommendations_for_engineer(
        self, user_id: uuid.UUID, skip: int = 0, limit: int = 20
    ) -> Sequence[JobMatch]:
        """Fetch or compute recommendations for logged in engineer."""
        engineer = await self.engineer_repo.get_by_user_id(user_id)
        if not engineer:
            raise NotFoundError("Engineer profile required to generate job recommendations")

        # Fetch existing matches
        existing = await self.match_repo.list_recommendations_for_engineer(
            engineer.id, skip=skip, limit=limit
        )

        if len(existing) < 5:
            # Trigger fresh computation against top active jobs
            jobs = await self.job_repo.search(skip=0, limit=30)
            for job in jobs:
                await self.calculate_match(engineer, job)
            await self.db.commit()

            existing = await self.match_repo.list_recommendations_for_engineer(
                engineer.id, skip=skip, limit=limit
            )

        return existing

    async def get_or_compute_match_for_job(self, user_id: uuid.UUID, job_id: uuid.UUID) -> JobMatch:
        """Fetch this engineer's existing match against one specific job, computing it on
        demand if it doesn't exist yet — used by the job detail page's AI match panel."""
        engineer = await self.engineer_repo.get_by_user_id(user_id)
        if not engineer:
            raise NotFoundError("Engineer profile required to view job match")

        job = await self.job_repo.get_by_id(job_id)
        if not job:
            raise NotFoundError("Job post not found")

        existing = await self.match_repo.get_match(engineer.id, job.id)
        if existing:
            return existing

        await self.calculate_match(engineer, job)
        await self.db.commit()
        # Re-fetch rather than return calculate_match's result directly: that
        # object's `.job`/`.engineer` relationships aren't eager-loaded, and
        # JobMatchResponse needs them populated for the job detail page.
        match = await self.match_repo.get_match(engineer.id, job.id)
        if not match:
            raise NotFoundError("Failed to generate job match")
        return match

    async def get_top_candidates_for_job(
        self, job_id: uuid.UUID, skip: int = 0, limit: int = 20
    ) -> Sequence[JobMatch]:
        """Fetch top recommended engineer candidates for a company's job post."""
        job = await self.job_repo.get_by_id(job_id)
        if not job:
            raise NotFoundError("Job post not found")

        # Compute against public engineer profiles
        engineers = await self.engineer_repo.search(skip=0, limit=30)
        for engineer in engineers:
            await self.calculate_match(engineer, job)
        await self.db.commit()

        return await self.match_repo.list_top_candidates_for_job(job_id, skip=skip, limit=limit)
