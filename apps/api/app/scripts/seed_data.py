"""
Seed database with demo users, engineer profiles, company profiles, job posts, projects, and groups.

Run with:
    python -m app.scripts.seed_data
"""

import asyncio
import uuid
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.domains.auth.models import User, UserRole
from app.domains.engineers.models import EngineerProfile
from app.domains.companies.models import CompanyProfile
from app.domains.jobs.models import JobPost
from app.domains.groups.models import Group
from app.domains.projects.models import Project


async def seed_demo_data():
    async with AsyncSessionLocal() as session:
        # Serialize concurrent worker startup (multi-worker uvicorn) to avoid
        # duplicate-key races. The lock is session-scoped and blocks until held.
        await session.execute(text("SELECT pg_advisory_lock(66778899)"))
        print("🌱 Seeding WorkMesh AI Demo Data...")
        try:
            await _seed_locked(session)
        finally:
            await session.execute(text("SELECT pg_advisory_unlock(66778899)"))


async def _seed_locked(session):
        # ── 1. Demo users & profiles ────────────────────────────────────────────

        # 1. Demo Admin User
        admin_email = "admin@workmesh.ai"
        admin = await session.scalar(select(User).where(User.email == admin_email))
        if not admin:
            admin = User(
                id=uuid.uuid4(),
                email=admin_email,
                full_name="Platform Admin",
                password_hash=get_password_hash("admin123"),
                role=UserRole.ADMIN,
                is_active=True,
            )
            session.add(admin)
            print("  ✓ Created Admin User: admin@workmesh.ai / admin123")

        # 2. Demo Engineer User
        engineer_email = "engineer@workmesh.ai"
        eng_user = await session.scalar(select(User).where(User.email == engineer_email))
        if not eng_user:
            eng_user = User(
                id=uuid.uuid4(),
                email=engineer_email,
                full_name="Alex Rivera",
                password_hash=get_password_hash("engineer123"),
                role=UserRole.ENGINEER,
                is_active=True,
            )
            session.add(eng_user)
            await session.flush()

            eng_profile = EngineerProfile(
                id=uuid.uuid4(),
                user_id=eng_user.id,
                headline="Senior Full-Stack AI Engineer",
                bio="Passionate engineer building distributed AI systems, Next.js applications, and FastAPI microservices.",
                skills=["Python", "TypeScript", "FastAPI", "Next.js", "PyTorch", "PostgreSQL", "Docker"],
                years_of_experience=6,
                location="San Francisco, CA",
                hourly_rate=95.0,
                is_open_to_work=True,
            )
            session.add(eng_profile)
            print("  ✓ Created Engineer User: engineer@workmesh.ai / engineer123")

        # 3. Demo Company User
        company_email = "company@workmesh.ai"
        comp_user = await session.scalar(select(User).where(User.email == company_email))
        if not comp_user:
            comp_user = User(
                id=uuid.uuid4(),
                email=company_email,
                full_name="Acme AI Technologies",
                password_hash=get_password_hash("company123"),
                role=UserRole.COMPANY,
                is_active=True,
            )
            session.add(comp_user)
            await session.flush()

            comp_profile = CompanyProfile(
                id=uuid.uuid4(),
                user_id=comp_user.id,
                name="Acme AI Technologies",
                description="Leading enterprise AI solutions provider creating high-throughput automated workflow platform.",
                website="https://acme-ai.example.com",
                industry="Artificial Intelligence",
                company_size="50-200",
                location="New York, NY",
                is_verified=True,
            )
            session.add(comp_profile)
            print("  ✓ Created Company User: company@workmesh.ai / company123")

        await session.commit()

        # 4. Demo Jobs
        job_count = await session.scalar(select(JobPost))
        if not job_count:
            company = await session.scalar(select(CompanyProfile).where(CompanyProfile.name == "Acme AI Technologies"))
            demo_jobs = [
                JobPost(
                    id=uuid.uuid4(),
                    company_id=company.id if company else None,
                    title="Senior Backend Systems Engineer (FastAPI & Async Python)",
                    slug="senior-backend-systems-engineer-fastapi-async-python",
                    company_name="Acme AI Technologies",
                    description="We are seeking an experienced Backend Engineer to scale our distributed worker dispatch and LLM agent pipelines.",
                    location="Remote (US / EU)",
                    skills=["Python", "FastAPI", "PostgreSQL", "Redis", "Celery"],
                    salary_min=140000,
                    salary_max=185000,
                    currency="USD",
                    is_remote=True,
                    job_type="full-time",
                    is_active=True,
                ),
                JobPost(
                    id=uuid.uuid4(),
                    company_id=company.id if company else None,
                    title="Lead Frontend Engineer (Next.js & React 19)",
                    slug="lead-frontend-engineer-nextjs-react-19",
                    company_name="Acme AI Technologies",
                    description="Lead frontend developer responsible for building real-time WebSocket dashboards, AI score visualizers, and interactive canvases.",
                    location="Remote",
                    skills=["TypeScript", "Next.js", "React", "TailwindCSS", "TanStack Query"],
                    salary_min=130000,
                    salary_max=175000,
                    currency="USD",
                    is_remote=True,
                    job_type="full-time",
                    is_active=True,
                ),
            ]
            session.add_all(demo_jobs)
            print(f"  ✓ Created {len(demo_jobs)} Demo Job Listings")

        # 5. Demo Groups
        group_count = await session.scalar(select(Group))
        if not group_count:
            demo_groups = [
                Group(
                    id=uuid.uuid4(),
                    name="AI & LLM Architecture Collective",
                    slug="ai-llm-architecture",
                    description="A community for engineers designing LLM agents, LiteLLM gateways, and multi-agent workflows.",
                    category="AI & Machine Learning",
                    is_private=False,
                ),
                Group(
                    id=uuid.uuid4(),
                    name="FastAPI & Async Python Masters",
                    slug="fastapi-async-python",
                    description="Discussions around high-performance Python, SQLAlchemy 2.0 async, Alembic, and Pydantic v2.",
                    category="Backend Systems",
                    is_private=False,
                ),
            ]
            session.add_all(demo_groups)
            print(f"  ✓ Created {len(demo_groups)} Developer Groups")

        await session.commit()
        print("✅ Database seeding complete!")


if __name__ == "__main__":
    asyncio.run(seed_demo_data())
