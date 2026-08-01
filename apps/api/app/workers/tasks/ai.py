"""
AI Celery background tasks — Resume parsing and Job enrichment.
"""

import uuid
import asyncio
from app.workers.celery_app import celery_app
from app.core.database import AsyncSessionFactory
from app.domains.engineers.repository import EngineerRepository
from app.domains.jobs.repository import JobRepository
from app.agents.resume_parser import ResumeParserAgent
from app.agents.job_enricher import JobEnricherAgent
from app.core.logging import get_logger

logger = get_logger("workers.tasks.ai")


async def _async_parse_resume(user_id_str: str, resume_text: str):
    async with AsyncSessionFactory() as session:
        repo = EngineerRepository(session)
        user_id = uuid.UUID(user_id_str)
        profile = await repo.get_by_user_id(user_id)
        if not profile:
            return None

        parser = ResumeParserAgent()
        parsed_data = await parser.parse_resume_text(resume_text)

        profile.parsed_resume_data = parsed_data
        if parsed_data.get("headline"):
            profile.headline = parsed_data["headline"]
        if parsed_data.get("bio"):
            profile.bio = parsed_data["bio"]
        if parsed_data.get("skills"):
            profile.skills = list(set((profile.skills or []) + parsed_data["skills"]))

        await session.commit()
        logger.info(f"Resume parsed for user {user_id}")
        return parsed_data


async def _async_enrich_job(job_id_str: str):
    async with AsyncSessionFactory() as session:
        repo = JobRepository(session)
        job_id = uuid.UUID(job_id_str)
        job = await repo.get_by_id(job_id)
        if not job:
            return None

        enricher = JobEnricherAgent()
        enrichment = await enricher.enrich_job_post(job.title, job.description)

        if enrichment.get("extracted_skills"):
            job.skills = list(set((job.skills or []) + enrichment["extracted_skills"]))
        if enrichment.get("seniority"):
            job.experience_level = enrichment["seniority"]

        await session.commit()
        logger.info(f"Job enriched for {job_id}")
        return enrichment


@celery_app.task(name="app.workers.tasks.ai.parse_resume_text_task", queue="default")
def parse_resume_text_task(user_id: str, resume_text: str):
    """Background task to parse raw resume text into structured engineer profile data."""
    logger.info(f"Parsing resume text for user {user_id}")
    return asyncio.run(_async_parse_resume(user_id, resume_text))


@celery_app.task(name="app.workers.tasks.ai.enrich_job_post_task", queue="default")
def enrich_job_post_task(job_id: str):
    """Background task to enrich job details with AI extracted skills and metadata."""
    logger.info(f"Enriching job post {job_id}")
    return asyncio.run(_async_enrich_job(job_id))
