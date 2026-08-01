import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.jobs.models import JobPost
from app.domains.saved_jobs.models import SavedJob

router = APIRouter(prefix="/saved-jobs", tags=["Saved Jobs"])


@router.get("")
async def list_saved_jobs(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(JobPost).join(SavedJob, SavedJob.job_id == JobPost.id)
        .where(SavedJob.user_id == current_user.id).order_by(SavedJob.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{job_id}", status_code=status.HTTP_201_CREATED)
async def save_job(job_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    job = await db.get(JobPost, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    existing = await db.scalar(select(SavedJob).where(SavedJob.user_id == current_user.id, SavedJob.job_id == job_id))
    if not existing:
        db.add(SavedJob(user_id=current_user.id, job_id=job_id))
    return {"job_id": job_id, "saved": True}


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unsave_job(job_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(SavedJob).where(SavedJob.user_id == current_user.id, SavedJob.job_id == job_id))
    return None
