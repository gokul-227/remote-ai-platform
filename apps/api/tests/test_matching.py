"""
Tests for AI Matching Engine logic.
"""

import pytest
import uuid
from httpx import AsyncClient
from app.domains.engineers.models import EngineerProfile
from app.domains.jobs.models import JobPost
from app.domains.matching.service import MatchingService


@pytest.mark.asyncio
async def test_matching_score_calculation(client: AsyncClient):
    from conftest import TestingSessionLocal
    async with TestingSessionLocal() as db:
        eng_id = uuid.uuid4()
        user_id = uuid.uuid4()

        engineer = EngineerProfile(
            id=eng_id,
            user_id=user_id,
            headline="Senior Python & React Engineer",
            years_of_experience=5,
            primary_role="Backend Engineer",
            skills=["Python", "FastAPI", "React", "PostgreSQL"],
        )

        job = JobPost(
            id=uuid.uuid4(),
            title="Senior Python Backend Engineer",
            slug="python-backend-eng",
            description="Looking for Python FastAPI expert",
            company_name="Remote AI Platform Test Co",
            is_remote=True,
            job_type="full-time",
            experience_level="senior",
            skills=["Python", "FastAPI", "PostgreSQL", "Docker"],
        )

        db.add(engineer)
        db.add(job)
        await db.flush()

        service = MatchingService(db)
        match_obj = await service.calculate_match(engineer, job)
        
        assert match_obj.overall_score > 60.0
        assert "Python" in match_obj.matching_skills
        assert "Docker" in match_obj.missing_skills
        assert len(match_obj.reasoning) > 0
