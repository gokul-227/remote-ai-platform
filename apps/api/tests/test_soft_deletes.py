"""
Tests for Soft Deletion and Composite Indexing Support.
Verifies entities preserve data integrity when marked as deleted.
"""

from datetime import datetime, timezone
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.contracts.models import Contract
from app.domains.jobs.models import JobPost
from app.domains.projects.models import Project


@pytest.mark.asyncio
async def test_soft_delete_preserves_records(test_user: User, db: AsyncSession):
    test_user.role = UserRole.COMPANY
    await db.commit()

    company = CompanyProfile(user_id=test_user.id, name="Soft Delete Corp")
    db.add(company)
    await db.flush()

    # 1. Create a JobPost
    job = JobPost(
        company_id=company.id,
        title="Senior Distributed Systems Engineer",
        slug="senior-distributed-systems-engineer",
        description="Build scalable systems",
        company_name="Soft Delete Corp",
        is_remote=True,
        is_active=True,
        is_deleted=False,
    )
    db.add(job)
    await db.flush()

    # 2. Soft delete JobPost
    job.is_deleted = True
    job.deleted_at = datetime.now(timezone.utc)
    await db.commit()

    # 3. Assert row still exists in database
    retrieved_job = await db.get(JobPost, job.id)
    assert retrieved_job is not None
    assert retrieved_job.is_deleted is True
    assert retrieved_job.deleted_at is not None

    # 4. Create Project and verify soft delete
    project = Project(
        company_id=company.id,
        title="Core Infrastructure Upgrade",
        description="Kubernetes migration",
        status="ACTIVE",
        is_deleted=False,
    )
    db.add(project)
    await db.flush()

    project.is_deleted = True
    project.deleted_at = datetime.now(timezone.utc)
    await db.commit()

    retrieved_proj = await db.get(Project, project.id)
    assert retrieved_proj is not None
    assert retrieved_proj.is_deleted is True
