"""MATCH-01: candidate search scores the whole open-to-work pool (not the
first N by update time), stale scores are refreshed, and listings drop jobs
and profiles that stopped being eligible after they were scored."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest


async def _profile(db, skills, updated_ago_days=0, **kw):
    from app.domains.auth.models import User, UserRole
    from app.domains.engineers.models import EngineerProfile

    user = User(email=f"m-{uuid.uuid4().hex[:8]}@example.com", full_name="P", role=UserRole.ENGINEER)
    db.add(user)
    await db.flush()
    prof = EngineerProfile(user_id=user.id, skills=skills, years_of_experience=5,
                           updated_at=datetime.now(UTC) - timedelta(days=updated_ago_days), **kw)
    db.add(prof)
    await db.flush()
    return prof


async def _job(db, skills, **kw):
    from app.domains.jobs.models import JobPost

    job = JobPost(title="Backend", slug=f"j-{uuid.uuid4().hex[:8]}", description="d", company_name="C",
                  skills=skills, **kw)
    db.add(job)
    await db.flush()
    return job


@pytest.mark.asyncio
async def test_best_candidate_beyond_the_first_page_is_found(monkeypatch):
    from conftest import TestingSessionLocal

    from app.domains.matching import service as matching

    monkeypatch.setattr(matching, "CANDIDATE_PAGE_SIZE", 2)
    async with TestingSessionLocal() as db:
        job = await _job(db, ["Python", "FastAPI", "PostgreSQL"])
        for i in range(5):  # recently updated, weak matches fill the first pages
            await _profile(db, ["Excel"], updated_ago_days=i)
        best = await _profile(db, ["Python", "FastAPI", "PostgreSQL"], updated_ago_days=400)
        await db.commit()
        top = await matching.MatchingService(db).get_top_candidates_for_job(job.id, limit=3)
        assert top
        assert top[0].engineer_id == best.id


@pytest.mark.asyncio
async def test_candidates_drop_profiles_no_longer_open_to_work():
    from conftest import TestingSessionLocal

    from app.domains.matching.service import MatchingService

    async with TestingSessionLocal() as db:
        job = await _job(db, ["Python"])
        prof = await _profile(db, ["Python"])
        await db.commit()
        svc = MatchingService(db)
        assert [m.engineer_id for m in await svc.get_top_candidates_for_job(job.id)] == [prof.id]
        prof.is_open_to_work = False
        await db.commit()
        assert await svc.match_repo.list_top_candidates_for_job(job.id) == []


@pytest.mark.asyncio
async def test_stale_stored_score_is_refreshed(monkeypatch):
    from conftest import TestingSessionLocal

    from app.domains.matching.service import MatchingService

    async with TestingSessionLocal() as db:
        job = await _job(db, ["Python", "Go"])
        prof = await _profile(db, ["Python", "Go"])
        await db.commit()
        svc = MatchingService(db)
        await svc.get_top_candidates_for_job(job.id)
        before = (await svc.match_repo.get_match(prof.id, job.id)).overall_score
        prof.skills = ["Excel"]
        await db.commit()
        await svc.get_top_candidates_for_job(job.id)
        await db.refresh(await svc.match_repo.get_match(prof.id, job.id))
        assert (await svc.match_repo.get_match(prof.id, job.id)).overall_score < before


@pytest.mark.asyncio
async def test_recommendations_drop_hidden_expired_and_deleted_jobs():
    from conftest import TestingSessionLocal

    from app.domains.matching.service import MatchingService

    async with TestingSessionLocal() as db:
        prof = await _profile(db, ["Python"])
        jobs = [await _job(db, ["Python"]) for _ in range(6)]
        await db.commit()
        svc = MatchingService(db)
        for job in jobs:
            await svc.calculate_match(prof, job)
        await db.commit()
        jobs[0].is_active = False
        jobs[1].expired_at = datetime.now(UTC)
        jobs[2].is_deleted = True
        await db.commit()
        listed = {m.job_id for m in await svc.match_repo.list_recommendations_for_engineer(prof.id)}
        assert listed == {jobs[3].id, jobs[4].id, jobs[5].id}
