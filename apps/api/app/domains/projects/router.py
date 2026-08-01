import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.marketplace.models import AIReport, ProjectTask
from app.domains.projects.models import Milestone, Project, ProjectActivity, ProjectMember, TaskComment
from app.services.ai.service import AIService

router = APIRouter(prefix="/projects", tags=["Projects"])

PROJECT_STATUSES = {"CREATED", "PLANNING", "ACTIVE", "REVIEW", "COMPLETED", "CANCELLED"}
TASK_STATUSES = {"TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"}


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    technologies: List[str] = Field(default_factory=list)
    timeline: Optional[str] = None
    budget: Optional[float] = Field(default=None, ge=0)
    company_id: Optional[uuid.UUID] = None
    member_ids: List[uuid.UUID] = Field(default_factory=list)


class ProjectStatusUpdate(BaseModel):
    status: str


class MilestoneCreate(BaseModel):
    project_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    position: int = Field(default=0, ge=0)


class TaskCreate(BaseModel):
    project_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    milestone: Optional[str] = None
    required_skills: List[str] = Field(default_factory=list)
    assigned_user_id: Optional[uuid.UUID] = None
    priority: str = "MEDIUM"
    deadline: Optional[datetime] = None
    estimated_hours: Optional[float] = Field(default=None, ge=0)


class TaskUpdate(BaseModel):
    status: Optional[str] = None
    assigned_user_id: Optional[uuid.UUID] = None
    priority: Optional[str] = None
    deadline: Optional[datetime] = None


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=10000)


async def get_project(project_id: uuid.UUID, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def can_access(project: Project, user: User, db: AsyncSession) -> bool:
    if user.role == UserRole.ADMIN:
        return True
    if user.role == UserRole.COMPANY:
        company = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == user.id))
        return bool(company and company.id == project.company_id)
    return bool(await db.scalar(select(ProjectMember).where(ProjectMember.project_id == project.id, ProjectMember.user_id == user.id)))


async def require_project_access(project_id: uuid.UUID, user: User, db: AsyncSession) -> Project:
    project = await get_project(project_id, db)
    if not await can_access(project, user, db):
        raise HTTPException(status_code=403, detail="Project access required")
    return project


async def record_activity(db: AsyncSession, project_id: uuid.UUID, actor_id: uuid.UUID, action: str, payload: Dict[str, Any] | None = None) -> None:
    db.add(ProjectActivity(project_id=project_id, actor_id=actor_id, action=action, payload=payload or {}))


@router.get("")
async def list_projects(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role == UserRole.COMPANY:
        company = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == current_user.id))
        if not company:
            return []
        result = await db.execute(select(Project).where(Project.company_id == company.id).order_by(Project.created_at.desc()))
    elif current_user.role == UserRole.ADMIN:
        result = await db.execute(select(Project).order_by(Project.created_at.desc()))
    else:
        result = await db.execute(
            select(Project).join(ProjectMember, ProjectMember.project_id == Project.id).where(ProjectMember.user_id == current_user.id).order_by(Project.created_at.desc())
        )
    return result.scalars().all()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    company = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == current_user.id))
    if not company and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=404, detail="Company profile required")
    company_id = company.id if company else data.company_id
    if not company_id:
        raise HTTPException(status_code=422, detail="company_id is required for admin project creation")
    project = Project(company_id=company_id, title=data.title, description=data.description, technologies=data.technologies, timeline=data.timeline, budget=data.budget)
    db.add(project)
    await db.flush()
    for member_id in data.member_ids:
        db.add(ProjectMember(project_id=project.id, user_id=member_id))
    await record_activity(db, project.id, current_user.id, "PROJECT_CREATED")
    return project


@router.get("/{project_id}")
async def project_detail(project_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await require_project_access(project_id, current_user, db)
    tasks = (await db.execute(select(ProjectTask).where(ProjectTask.project_id == project.id).order_by(ProjectTask.created_at.asc()))).scalars().all()
    milestones = (await db.execute(select(Milestone).where(Milestone.project_id == project.id).order_by(Milestone.position.asc()))).scalars().all()
    return {"project": project, "milestones": milestones, "tasks": tasks}


@router.patch("/{project_id}/status")
async def update_project_status(project_id: uuid.UUID, data: ProjectStatusUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await require_project_access(project_id, current_user, db)
    if data.status not in PROJECT_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid project status")
    project.status = data.status
    await record_activity(db, project.id, current_user.id, "PROJECT_STATUS_UPDATED", {"status": data.status})
    return project


@router.post("/milestones", status_code=status.HTTP_201_CREATED)
async def create_milestone(data: MilestoneCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await require_project_access(data.project_id, current_user, db)
    milestone = Milestone(**data.model_dump())
    db.add(milestone)
    await db.flush()
    await record_activity(db, project.id, current_user.id, "MILESTONE_CREATED", {"title": milestone.title})
    return milestone


@router.get("/{project_id}/milestones")
async def list_milestones(project_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_project_access(project_id, current_user, db)
    return (await db.execute(select(Milestone).where(Milestone.project_id == project_id).order_by(Milestone.position.asc()))).scalars().all()


@router.post("/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(data: TaskCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await require_project_access(data.project_id, current_user, db)
    task = ProjectTask(**data.model_dump())
    db.add(task)
    await db.flush()
    await record_activity(db, project.id, current_user.id, "TASK_CREATED", {"title": task.title})
    return task


@router.get("/{project_id}/tasks")
async def list_project_tasks(project_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_project_access(project_id, current_user, db)
    return (await db.execute(select(ProjectTask).where(ProjectTask.project_id == project_id).order_by(ProjectTask.created_at.asc()))).scalars().all()


@router.patch("/tasks/{task_id}")
async def update_task(task_id: uuid.UUID, data: TaskUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    task = await db.get(ProjectTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    project = await require_project_access(task.project_id, current_user, db)
    updates = data.model_dump(exclude_unset=True)
    if updates.get("status") and updates["status"] not in TASK_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid task status")
    for key, value in updates.items():
        setattr(task, key, value)
    if task.status == "COMPLETED":
        task.completed_at = datetime.utcnow()
    await record_activity(db, project.id, current_user.id, "TASK_UPDATED", {"task_id": str(task.id), **updates})
    return task


@router.post("/tasks/{task_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_task_comment(task_id: uuid.UUID, data: CommentCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    task = await db.get(ProjectTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    project = await require_project_access(task.project_id, current_user, db)
    comment = TaskComment(task_id=task.id, author_id=current_user.id, content=data.content)
    db.add(comment)
    await db.flush()
    await record_activity(db, project.id, current_user.id, "TASK_COMMENTED", {"task_id": str(task.id)})
    return comment


@router.post("/{project_id}/plan")
async def generate_project_plan(project_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await require_project_access(project_id, current_user, db)
    project.status = "PLANNING"
    response = await AIService().analyze(
        f"Project title: {project.title}\nDescription: {project.description}\nTechnologies: {project.technologies}\nTimeline: {project.timeline}",
        "Create a project delivery plan. Return JSON with milestones (array of objects with title, description, position), tasks (array of objects with title, description, milestone, required_skills, priority, estimated_hours), timeline, dependencies, and summary.",
    )
    plan = response.data
    if not plan:
        raise HTTPException(status_code=503, detail="AI provider is not configured")
    for item in plan.get("milestones", []):
        db.add(Milestone(project_id=project.id, title=item.get("title", "Milestone"), description=item.get("description"), position=item.get("position", 0)))
    for item in plan.get("tasks", []):
        db.add(ProjectTask(project_id=project.id, title=item.get("title", "Task"), description=item.get("description"), milestone=item.get("milestone"), required_skills=item.get("required_skills", []), priority=item.get("priority", "MEDIUM"), estimated_hours=item.get("estimated_hours")))
    report = AIReport(project_id=project.id, user_id=current_user.id, report_type="PROJECT_PLAN", payload=plan, content=plan.get("summary"))
    db.add(report)
    await record_activity(db, project.id, current_user.id, "AI_PLAN_GENERATED")
    return {"project": project, "plan": plan, "report": report}


@router.get("/{project_id}/ai-report")
async def list_ai_reports(project_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_project_access(project_id, current_user, db)
    return (await db.execute(select(AIReport).where(AIReport.project_id == project_id).order_by(AIReport.created_at.desc()))).scalars().all()


async def create_ai_report(project: Project, current_user: User, db: AsyncSession, report_type: str, prompt: str, system_prompt: str) -> AIReport:
    response = await AIService().analyze(prompt, system_prompt)
    if not response.data:
        raise HTTPException(status_code=503, detail="AI provider is not configured")
    report = AIReport(project_id=project.id, user_id=current_user.id, report_type=report_type, payload=response.data, content=response.data.get("summary"))
    db.add(report)
    await db.flush()
    await record_activity(db, project.id, current_user.id, f"AI_{report_type}_GENERATED")
    return report


@router.post("/{project_id}/ai/progress-summary")
async def generate_progress_summary(project_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await require_project_access(project_id, current_user, db)
    tasks = (await db.execute(select(ProjectTask).where(ProjectTask.project_id == project.id))).scalars().all()
    report = await create_ai_report(project, current_user, db, "PROGRESS_SUMMARY", f"Project: {project.title}\nTasks: {[{'title': t.title, 'status': t.status, 'deadline': str(t.deadline)} for t in tasks]}", "Summarize project progress. Return JSON with summary, completed_tasks, pending_tasks, delayed_tasks, and recommendations.")
    return report


@router.post("/{project_id}/ai/risk-analysis")
async def generate_risk_analysis(project_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await require_project_access(project_id, current_user, db)
    tasks = (await db.execute(select(ProjectTask).where(ProjectTask.project_id == project.id))).scalars().all()
    report = await create_ai_report(project, current_user, db, "RISK_ANALYSIS", f"Project: {project.title}\nTasks: {[{'title': t.title, 'status': t.status, 'deadline': str(t.deadline)} for t in tasks]}", "Analyze delivery risks. Return JSON with risk_level, reason, delayed_tasks, blocked_tasks, and recommendations.")
    return report


@router.post("/{project_id}/ai/documentation")
async def generate_documentation(project_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await require_project_access(project_id, current_user, db)
    report = await create_ai_report(project, current_user, db, "DOCUMENTATION", f"Project: {project.title}\nDescription: {project.description}\nTechnologies: {project.technologies}", "Generate concise technical documentation. Return JSON with summary, architecture, setup, and release_notes.")
    return report


@router.get("/{project_id}/activity")
async def list_project_activity(project_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_project_access(project_id, current_user, db)
    return (await db.execute(select(ProjectActivity).where(ProjectActivity.project_id == project_id).order_by(ProjectActivity.created_at.desc()))).scalars().all()
