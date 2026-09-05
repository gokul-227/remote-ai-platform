import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.quality_engine import QualityEngineAgent
from app.core.config import settings
from app.core.database import get_db
from app.domains.analytics.service import emit_analytics_event
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.contracts.models import ContractMilestone
from app.domains.engineers.models import EngineerProfile
from app.domains.marketplace.models import AIReport, ProjectTask
from app.domains.projects.models import (
    Milestone,
    PaymentTransaction,
    Project,
    ProjectActivity,
    ProjectMember,
    ProjectReview,
    TaskAssignmentOffer,
    TaskComment,
    TaskDependency,
    WorkLedgerEntry,
    WorkSubmission,
)
from app.services.ai.service import AIService
from app.services.notifications import notify_user
from app.services.payments import get_payment_provider

router = APIRouter(prefix="/projects", tags=["Projects"])

PROJECT_STATUSES = {"CREATED", "PLANNING", "ACTIVE", "REVIEW", "COMPLETED", "CANCELLED"}
TASK_STATUSES = {"TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"}
OFFER_STATUSES = {"OFFERED", "ACCEPTED", "DECLINED", "CANCELLED"}
SUBMISSION_STATUSES = {"SUBMITTED", "CHANGES_REQUESTED", "APPROVED"}


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    technologies: list[str] = Field(default_factory=list)
    timeline: str | None = None
    budget: float | None = Field(default=None, ge=0)
    company_id: uuid.UUID | None = None
    member_ids: list[uuid.UUID] = Field(default_factory=list)


class ProjectStatusUpdate(BaseModel):
    status: str


class MilestoneCreate(BaseModel):
    project_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    position: int = Field(default=0, ge=0)
    amount: float | None = Field(default=None, ge=0)
    due_date: datetime | None = None
    contract_milestone_id: uuid.UUID | None = None


class MilestoneStatusUpdate(BaseModel):
    status: str = Field(pattern="^(TODO|IN_PROGRESS|IN_REVIEW|DONE|COMPLETED)$")


class TaskCreate(BaseModel):
    project_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    milestone: str | None = None
    required_skills: list[str] = Field(default_factory=list)
    assigned_user_id: uuid.UUID | None = None
    priority: str = "MEDIUM"
    deadline: datetime | None = None
    estimated_hours: float | None = Field(default=None, ge=0)


class TaskUpdate(BaseModel):
    status: str | None = None
    assigned_user_id: uuid.UUID | None = None
    priority: str | None = None
    deadline: datetime | None = None


class TaskDependencyCreate(BaseModel):
    depends_on_task_id: uuid.UUID


class TaskOfferCreate(BaseModel):
    candidate_id: uuid.UUID


class TaskOfferResponse(BaseModel):
    status: str


class WorkSubmissionCreate(BaseModel):
    summary: str = Field(min_length=1, max_length=20000)
    artifact_urls: list[str] = Field(default_factory=list, max_length=20)


class WorkSubmissionReview(BaseModel):
    status: str
    review_note: str | None = Field(default=None, max_length=20000)


class WorkLedgerEntryCreate(BaseModel):
    duration_minutes: int = Field(gt=0, le=1440)
    description: str = Field(min_length=1, max_length=10000)
    submission_id: uuid.UUID | None = None


class WorkLedgerVoid(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class EscrowCreate(BaseModel):
    amount: float = Field(gt=0, le=1_000_000)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    task_id: uuid.UUID | None = None
    payee_id: uuid.UUID


class ProjectReviewCreate(BaseModel):
    reviewee_id: uuid.UUID
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=1, max_length=10000)


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
    return bool(
        await db.scalar(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id, ProjectMember.user_id == user.id
            )
        )
    )


async def require_project_access(project_id: uuid.UUID, user: User, db: AsyncSession) -> Project:
    project = await get_project(project_id, db)
    if not await can_access(project, user, db):
        raise HTTPException(status_code=403, detail="Project access required")
    return project


async def record_activity(
    db: AsyncSession,
    project_id: uuid.UUID,
    actor_id: uuid.UUID,
    action: str,
    payload: dict[str, Any] | None = None,
) -> None:
    db.add(
        ProjectActivity(
            project_id=project_id, actor_id=actor_id, action=action, payload=payload or {}
        )
    )


@router.get("")
async def list_projects(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    if current_user.role == UserRole.COMPANY:
        company = await db.scalar(
            select(CompanyProfile).where(CompanyProfile.user_id == current_user.id)
        )
        if not company:
            return []
        result = await db.execute(
            select(Project)
            .where(Project.company_id == company.id)
            .order_by(Project.created_at.desc())
        )
    elif current_user.role == UserRole.ADMIN:
        result = await db.execute(select(Project).order_by(Project.created_at.desc()))
    else:
        result = await db.execute(
            select(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == current_user.id)
            .order_by(Project.created_at.desc())
        )
    return result.scalars().all()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    company = await db.scalar(
        select(CompanyProfile).where(CompanyProfile.user_id == current_user.id)
    )
    if not company and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=404, detail="Company profile required")
    company_id = company.id if company else data.company_id
    if not company_id:
        raise HTTPException(
            status_code=422, detail="company_id is required for admin project creation"
        )
    project = Project(
        company_id=company_id,
        title=data.title,
        description=data.description,
        technologies=data.technologies,
        timeline=data.timeline,
        budget=data.budget,
    )
    db.add(project)
    await db.flush()
    for member_id in data.member_ids:
        db.add(ProjectMember(project_id=project.id, user_id=member_id))
    await record_activity(db, project.id, current_user.id, "PROJECT_CREATED")
    await emit_analytics_event(
        db, "project_created", current_user.id, {"project_id": str(project.id)}
    )
    return project


@router.get("/task-offers")
async def list_task_offers(
    current_user: User = Depends(require_role(UserRole.ENGINEER)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TaskAssignmentOffer, ProjectTask, Project)
        .join(ProjectTask, TaskAssignmentOffer.task_id == ProjectTask.id)
        .join(Project, ProjectTask.project_id == Project.id)
        .where(TaskAssignmentOffer.candidate_user_id == current_user.id)
        .order_by(TaskAssignmentOffer.created_at.desc())
    )
    return [
        {"offer": offer, "task": task, "project": project} for offer, task, project in result.all()
    ]


@router.get("/my-offers")
async def list_my_task_offers(
    current_user: User = Depends(require_role(UserRole.ENGINEER)),
    db: AsyncSession = Depends(get_db),
):
    """List all task assignment offers received by the current engineer."""
    result = await db.execute(
        select(TaskAssignmentOffer, ProjectTask, Project)
        .join(ProjectTask, TaskAssignmentOffer.task_id == ProjectTask.id)
        .join(Project, ProjectTask.project_id == Project.id)
        .where(TaskAssignmentOffer.candidate_user_id == current_user.id)
        .order_by(TaskAssignmentOffer.created_at.desc())
    )
    items = []
    for offer, task, project in result.all():
        items.append(
            {
                "offer": offer,
                "task": task,
                "project_id": str(project.id),
                "project_title": project.title,
            }
        )
    return items


@router.get("/my-tasks")
async def list_my_assigned_tasks(
    current_user: User = Depends(require_role(UserRole.ENGINEER)),
    db: AsyncSession = Depends(get_db),
):
    """List all tasks assigned to the current engineer across all projects."""
    result = await db.execute(
        select(ProjectTask, Project)
        .join(Project, ProjectTask.project_id == Project.id)
        .where(ProjectTask.assigned_user_id == current_user.id)
        .order_by(ProjectTask.created_at.desc())
    )
    items = []
    for task, project in result.all():
        # Get latest submission if any
        submission = await db.scalar(
            select(WorkSubmission)
            .where(WorkSubmission.task_id == task.id)
            .order_by(WorkSubmission.version.desc())
        )
        items.append(
            {
                "task": task,
                "project_id": str(project.id),
                "project_title": project.title,
                "latest_submission": submission,
            }
        )
    return items


@router.get("/reputation/{user_id}")
async def get_reputation(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    reviews = (
        (
            await db.execute(
                select(ProjectReview)
                .where(ProjectReview.reviewee_id == user_id)
                .order_by(ProjectReview.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    tasks = (
        (await db.execute(select(ProjectTask).where(ProjectTask.assigned_user_id == user_id)))
        .scalars()
        .all()
    )
    completed = sum(task.status == "COMPLETED" for task in tasks)
    average = round(sum(review.rating for review in reviews) / len(reviews), 2) if reviews else None
    factors = []
    if average is not None:
        factors.append(f"Average rating {average}/5 from {len(reviews)} project review(s)")
    if tasks:
        factors.append(f"Completed {completed} of {len(tasks)} assigned task(s)")
    return {
        "user_id": user_id,
        "average_rating": average,
        "rating_count": len(reviews),
        "trust_score": round(average * 20, 1) if average is not None else None,
        "completion_rate": round(completed / len(tasks) * 100, 1) if tasks else None,
        "factors": factors,
        "reviews": reviews,
    }


@router.get("/{project_id}")
async def project_detail(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(project_id, current_user, db)
    tasks = (
        (
            await db.execute(
                select(ProjectTask)
                .where(ProjectTask.project_id == project.id)
                .order_by(ProjectTask.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    task_ids = [task.id for task in tasks]
    dependencies = (
        (await db.execute(select(TaskDependency).where(TaskDependency.task_id.in_(task_ids))))
        .scalars()
        .all()
        if task_ids
        else []
    )
    milestones = (
        (
            await db.execute(
                select(Milestone)
                .where(Milestone.project_id == project.id)
                .order_by(Milestone.position.asc())
            )
        )
        .scalars()
        .all()
    )
    submissions = (
        (
            await db.execute(
                select(WorkSubmission)
                .join(ProjectTask, WorkSubmission.task_id == ProjectTask.id)
                .where(ProjectTask.project_id == project.id)
                .order_by(WorkSubmission.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    latest_plan = await db.scalar(
        select(AIReport)
        .where(AIReport.project_id == project.id, AIReport.report_type == "PROJECT_PLAN")
        .order_by(AIReport.created_at.desc())
    )
    return {
        "project": project,
        "milestones": milestones,
        "tasks": tasks,
        "dependencies": dependencies,
        "submissions": submissions,
        "plan": latest_plan.payload if latest_plan else None,
    }


@router.patch("/{project_id}/status")
async def update_project_status(
    project_id: uuid.UUID,
    data: ProjectStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(project_id, current_user, db)
    if data.status not in PROJECT_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid project status")
    project.status = data.status
    await record_activity(
        db, project.id, current_user.id, "PROJECT_STATUS_UPDATED", {"status": data.status}
    )
    return project


@router.post("/milestones", status_code=status.HTTP_201_CREATED)
async def create_milestone(
    data: MilestoneCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(data.project_id, current_user, db)
    milestone = Milestone(**data.model_dump())
    db.add(milestone)
    await db.flush()
    await record_activity(
        db, project.id, current_user.id, "MILESTONE_CREATED", {"title": milestone.title}
    )
    return milestone


@router.get("/{project_id}/milestones")
async def list_milestones(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_project_access(project_id, current_user, db)
    return (
        (
            await db.execute(
                select(Milestone)
                .where(Milestone.project_id == project_id)
                .order_by(Milestone.position.asc())
            )
        )
        .scalars()
        .all()
    )


@router.patch("/milestones/{milestone_id}/status")
async def update_milestone_status(
    milestone_id: uuid.UUID,
    data: MilestoneStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    milestone = await db.get(Milestone, milestone_id)
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
    project = await require_project_access(milestone.project_id, current_user, db)

    milestone.status = data.status

    # Synchronize linked ContractMilestone if present
    if milestone.contract_milestone_id:
        contract_milestone = await db.get(ContractMilestone, milestone.contract_milestone_id)
        if contract_milestone:
            status_map = {
                "TODO": "PENDING",
                "IN_PROGRESS": "IN_PROGRESS",
                "IN_REVIEW": "DELIVERED",
                "DONE": "APPROVED",
                "COMPLETED": "APPROVED",
            }
            contract_milestone.status = status_map.get(data.status, contract_milestone.status)

    await record_activity(
        db,
        project.id,
        current_user.id,
        "MILESTONE_STATUS_UPDATED",
        {"milestone_id": str(milestone.id), "status": data.status},
    )
    await db.flush()
    return milestone


@router.post("/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(
    data: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(data.project_id, current_user, db)
    task = ProjectTask(**data.model_dump())
    db.add(task)
    await db.flush()
    await record_activity(db, project.id, current_user.id, "TASK_CREATED", {"title": task.title})
    return task


@router.get("/{project_id}/tasks")
async def list_project_tasks(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_project_access(project_id, current_user, db)
    return (
        (
            await db.execute(
                select(ProjectTask)
                .where(ProjectTask.project_id == project_id)
                .order_by(ProjectTask.created_at.asc())
            )
        )
        .scalars()
        .all()
    )


@router.post("/tasks/{task_id}/ledger", status_code=status.HTTP_201_CREATED)
async def record_work_ledger_entry(
    task_id: uuid.UUID,
    data: WorkLedgerEntryCreate,
    current_user: User = Depends(require_role(UserRole.ENGINEER)),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ProjectTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.assigned_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the assigned worker can record effort")
    project = await require_project_access(task.project_id, current_user, db)
    if data.submission_id:
        submission = await db.get(WorkSubmission, data.submission_id)
        if (
            not submission
            or submission.task_id != task.id
            or submission.submitted_by_id != current_user.id
        ):
            raise HTTPException(
                status_code=422, detail="Submission must belong to this task and worker"
            )
    entry = WorkLedgerEntry(
        project_id=project.id,
        task_id=task.id,
        worker_id=current_user.id,
        submission_id=data.submission_id,
        duration_minutes=data.duration_minutes,
        description=data.description,
    )
    db.add(entry)
    await db.flush()
    await record_activity(
        db,
        project.id,
        current_user.id,
        "WORK_EFFORT_RECORDED",
        {
            "task_id": str(task.id),
            "entry_id": str(entry.id),
            "duration_minutes": entry.duration_minutes,
        },
    )
    return entry


@router.get("/{project_id}/ledger")
async def list_project_ledger(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(project_id, current_user, db)
    entries = (
        (
            await db.execute(
                select(WorkLedgerEntry)
                .where(WorkLedgerEntry.project_id == project.id)
                .order_by(WorkLedgerEntry.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    active_entries = [entry for entry in entries if entry.status == "RECORDED"]
    by_worker: dict[str, int] = {}
    for entry in active_entries:
        key = str(entry.worker_id)
        by_worker[key] = by_worker.get(key, 0) + entry.duration_minutes
    return {
        "entries": entries,
        "total_minutes": sum(entry.duration_minutes for entry in active_entries),
        "by_worker_minutes": by_worker,
    }


@router.patch("/ledger/{entry_id}/void")
async def void_work_ledger_entry(
    entry_id: uuid.UUID,
    data: WorkLedgerVoid,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(WorkLedgerEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Ledger entry not found")
    project = await require_project_access(entry.project_id, current_user, db)
    if entry.status != "RECORDED":
        raise HTTPException(status_code=409, detail="Ledger entry is already voided")
    entry.status = "VOID"
    entry.voided_by_id = current_user.id
    entry.void_reason = data.reason
    entry.voided_at = datetime.utcnow()
    await db.flush()
    await record_activity(
        db,
        project.id,
        current_user.id,
        "WORK_EFFORT_VOIDED",
        {"entry_id": str(entry.id), "reason": data.reason},
    )
    return entry


@router.get("/{project_id}/payments")
async def list_project_payments(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(project_id, current_user, db)
    payments = (
        (
            await db.execute(
                select(PaymentTransaction)
                .where(PaymentTransaction.project_id == project.id)
                .order_by(PaymentTransaction.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return payments


@router.post("/{project_id}/reviews", status_code=status.HTTP_201_CREATED)
async def create_project_review(
    project_id: uuid.UUID,
    data: ProjectReviewCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(project_id, current_user, db)
    if project.status != "COMPLETED":
        raise HTTPException(
            status_code=409, detail="Reviews are available after project completion"
        )
    if data.reviewee_id == current_user.id:
        raise HTTPException(status_code=422, detail="Users cannot review themselves")
    reviewee = await db.get(User, data.reviewee_id)
    if not reviewee or (reviewee.role != UserRole.ENGINEER and reviewee.role != UserRole.COMPANY):
        raise HTTPException(status_code=404, detail="Review recipient not found")
    if reviewee.role == UserRole.COMPANY:
        company = await db.scalar(
            select(CompanyProfile).where(
                CompanyProfile.user_id == reviewee.id, CompanyProfile.id == project.company_id
            )
        )
        if not company:
            raise HTTPException(
                status_code=403, detail="Review recipient is not part of this project"
            )
    elif not await db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project.id, ProjectMember.user_id == reviewee.id
        )
    ):
        raise HTTPException(status_code=403, detail="Review recipient is not part of this project")
    existing = await db.scalar(
        select(ProjectReview).where(
            ProjectReview.project_id == project.id,
            ProjectReview.reviewer_id == current_user.id,
            ProjectReview.reviewee_id == reviewee.id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=409, detail="You have already reviewed this project participant"
        )
    review = ProjectReview(
        project_id=project.id,
        reviewer_id=current_user.id,
        reviewee_id=reviewee.id,
        rating=data.rating,
        comment=data.comment,
    )
    db.add(review)
    await db.flush()
    await record_activity(
        db,
        project.id,
        current_user.id,
        "PROJECT_REVIEW_CREATED",
        {"review_id": str(review.id), "reviewee_id": str(reviewee.id), "rating": review.rating},
    )
    await notify_user(
        db,
        reviewee.id,
        "New project review",
        f"{current_user.full_name} left you a {review.rating}/5 project review.",
        "project_review",
    )
    return review


@router.get("/{project_id}/reviews")
async def list_project_reviews(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_project_access(project_id, current_user, db)
    return (
        (
            await db.execute(
                select(ProjectReview)
                .where(ProjectReview.project_id == project_id)
                .order_by(ProjectReview.created_at.desc())
            )
        )
        .scalars()
        .all()
    )


@router.post("/{project_id}/payments/escrow", status_code=status.HTTP_201_CREATED)
async def create_sandbox_escrow(
    project_id: uuid.UUID,
    data: EscrowCreate,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(project_id, current_user, db)
    if data.task_id:
        task = await db.get(ProjectTask, data.task_id)
        if not task or task.project_id != project.id:
            raise HTTPException(status_code=422, detail="Task must belong to the project")
    payee = await db.get(User, data.payee_id)
    if not payee or payee.role != UserRole.ENGINEER:
        raise HTTPException(status_code=422, detail="Payee must be an engineer")
    existing = await db.scalar(
        select(PaymentTransaction).where(
            PaymentTransaction.project_id == project.id,
            PaymentTransaction.task_id == data.task_id,
            PaymentTransaction.payee_id == data.payee_id,
            PaymentTransaction.status == "ESCROWED",
        )
    )
    if existing:
        raise HTTPException(
            status_code=409, detail="An active escrow already exists for this task and payee"
        )
    provider = get_payment_provider()
    authorization = await provider.authorize(data.amount, data.currency.upper())
    held = await provider.hold(authorization.reference, data.amount, data.currency.upper())
    payment = PaymentTransaction(
        project_id=project.id,
        task_id=data.task_id,
        payer_id=current_user.id,
        payee_id=data.payee_id,
        amount=data.amount,
        currency=data.currency.upper(),
        status=held.status,
        provider=settings.PAYMENT_PROVIDER.upper(),
        provider_reference=held.reference,
    )
    db.add(payment)
    await db.flush()
    await record_activity(
        db,
        project.id,
        current_user.id,
        "PAYMENT_ESCROWED",
        {"payment_id": str(payment.id), "amount": payment.amount, "currency": payment.currency},
    )
    return {
        "id": str(payment.id),
        "project_id": str(payment.project_id),
        "task_id": str(payment.task_id) if payment.task_id else None,
        "payer_id": str(payment.payer_id),
        "payee_id": str(payment.payee_id),
        "amount": payment.amount,
        "currency": payment.currency,
        "status": payment.status,
        "provider": payment.provider,
        "provider_reference": payment.provider_reference,
        "client_secret": authorization.client_secret,
    }


@router.patch("/payments/{payment_id}/release")
async def release_sandbox_payment(
    payment_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    payment = await db.get(PaymentTransaction, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    project = await require_project_access(payment.project_id, current_user, db)
    if payment.status != "ESCROWED":
        raise HTTPException(status_code=409, detail="Payment is not currently escrowed")
    result = await get_payment_provider().release(payment.provider_reference)
    payment.status = result.status
    payment.released_at = datetime.utcnow()
    await db.flush()
    await record_activity(
        db,
        project.id,
        current_user.id,
        "PAYMENT_RELEASED",
        {"payment_id": str(payment.id), "amount": payment.amount, "currency": payment.currency},
    )
    await notify_user(
        db,
        payment.payee_id,
        "Payment released",
        f"Payment of {payment.amount:.2f} {payment.currency} was released.",
        "payment_update",
    )
    return payment


@router.patch("/payments/{payment_id}/refund")
async def refund_sandbox_payment(
    payment_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    payment = await db.get(PaymentTransaction, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    project = await require_project_access(payment.project_id, current_user, db)
    if payment.status != "ESCROWED":
        raise HTTPException(status_code=409, detail="Only escrowed payments can be refunded")
    result = await get_payment_provider().refund(payment.provider_reference)
    payment.status = result.status
    await db.flush()
    await record_activity(
        db,
        project.id,
        current_user.id,
        "PAYMENT_REFUNDED",
        {"payment_id": str(payment.id), "amount": payment.amount, "currency": payment.currency},
    )
    await notify_user(
        db,
        payment.payee_id,
        "Payment refunded",
        f"Payment of {payment.amount:.2f} {payment.currency} was refunded.",
        "payment_update",
    )
    return payment


@router.post("/tasks/{task_id}/offers", status_code=status.HTTP_201_CREATED)
async def create_task_offer(
    task_id: uuid.UUID,
    data: TaskOfferCreate,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ProjectTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    project = await require_project_access(task.project_id, current_user, db)
    profile = await db.scalar(
        select(EngineerProfile).where(
            (EngineerProfile.id == data.candidate_id)
            | (EngineerProfile.user_id == data.candidate_id)
        )
    )
    if not profile or not profile.is_public:
        raise HTTPException(status_code=404, detail="Public engineer profile not found")
    if not profile.is_open_to_work:
        raise HTTPException(status_code=409, detail="Engineer is not open to work")
    required = {skill.strip().lower() for skill in (task.required_skills or []) if skill.strip()}
    available = {skill.strip().lower() for skill in (profile.skills or []) if skill.strip()}
    matched = sorted(required & available)
    if required and not matched:
        raise HTTPException(status_code=422, detail="Engineer does not match the task skills")
    active_offer = await db.scalar(
        select(TaskAssignmentOffer).where(
            TaskAssignmentOffer.task_id == task.id,
            TaskAssignmentOffer.candidate_user_id == profile.user_id,
            TaskAssignmentOffer.status == "OFFERED",
        )
    )
    if active_offer:
        return active_offer
    offer = TaskAssignmentOffer(
        task_id=task.id,
        candidate_user_id=profile.user_id,
        offered_by_id=current_user.id,
        match_score=(len(matched) / len(required) * 100) if required else 100,
        matched_skills=matched,
    )
    db.add(offer)
    await db.flush()
    await record_activity(
        db,
        project.id,
        current_user.id,
        "TASK_OFFERED",
        {
            "task_id": str(task.id),
            "candidate_user_id": str(profile.user_id),
            "match_score": offer.match_score,
        },
    )
    await notify_user(
        db,
        profile.user_id,
        "New task offer",
        f"You have been invited to work on {task.title}.",
        "task_offer",
    )
    return offer


@router.patch("/task-offers/{offer_id}")
async def respond_to_task_offer(
    offer_id: uuid.UUID,
    data: TaskOfferResponse,
    current_user: User = Depends(require_role(UserRole.ENGINEER)),
    db: AsyncSession = Depends(get_db),
):
    offer = await db.get(TaskAssignmentOffer, offer_id)
    if not offer or offer.candidate_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Task offer not found")
    if offer.status != "OFFERED":
        raise HTTPException(status_code=409, detail="Task offer is no longer active")
    if data.status not in {"ACCEPTED", "DECLINED"}:
        raise HTTPException(status_code=422, detail="Offer response must be ACCEPTED or DECLINED")
    task = await db.get(ProjectTask, offer.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    # An offered candidate is not a project member until accepting this offer.
    project = await get_project(task.project_id, db)
    offer.status = data.status
    offer.responded_at = datetime.utcnow()
    if data.status == "ACCEPTED":
        task.assigned_user_id = current_user.id
        if not await db.scalar(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id, ProjectMember.user_id == current_user.id
            )
        ):
            db.add(ProjectMember(project_id=project.id, user_id=current_user.id, role="WORKER"))
        other_offers = (
            (
                await db.execute(
                    select(TaskAssignmentOffer).where(
                        TaskAssignmentOffer.task_id == task.id,
                        TaskAssignmentOffer.status == "OFFERED",
                        TaskAssignmentOffer.id != offer.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        for other in other_offers:
            other.status = "CANCELLED"
        await record_activity(
            db,
            project.id,
            current_user.id,
            "TASK_OFFER_ACCEPTED",
            {"task_id": str(task.id), "offer_id": str(offer.id)},
        )
        if offer.offered_by_id != current_user.id:
            await notify_user(
                db,
                offer.offered_by_id,
                "Task offer accepted",
                f"{current_user.full_name} accepted the offer for {task.title}.",
                "task_offer_update",
            )
    else:
        await record_activity(
            db,
            project.id,
            current_user.id,
            "TASK_OFFER_DECLINED",
            {"task_id": str(task.id), "offer_id": str(offer.id)},
        )
    await db.flush()
    return offer


@router.patch("/task-offers/{offer_id}/cancel")
async def cancel_task_offer(
    offer_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    offer = await db.get(TaskAssignmentOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Task offer not found")
    task = await db.get(ProjectTask, offer.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    project = await require_project_access(task.project_id, current_user, db)
    if offer.status != "OFFERED":
        raise HTTPException(status_code=409, detail="Task offer is no longer active")
    offer.status = "CANCELLED"
    offer.responded_at = datetime.utcnow()
    await record_activity(
        db,
        project.id,
        current_user.id,
        "TASK_OFFER_CANCELLED",
        {"task_id": str(task.id), "offer_id": str(offer.id)},
    )
    return offer


@router.post("/tasks/{task_id}/submissions", status_code=status.HTTP_201_CREATED)
async def submit_task_work(
    task_id: uuid.UUID,
    data: WorkSubmissionCreate,
    current_user: User = Depends(require_role(UserRole.ENGINEER)),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ProjectTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.assigned_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the assigned worker can submit work")
    project = await get_project(task.project_id, db)
    latest = await db.scalar(
        select(WorkSubmission)
        .where(WorkSubmission.task_id == task.id)
        .order_by(WorkSubmission.version.desc())
    )
    if latest and latest.status not in {"CHANGES_REQUESTED"}:
        raise HTTPException(
            status_code=409, detail="A submission is already awaiting review or approved"
        )
    submission = WorkSubmission(
        task_id=task.id,
        submitted_by_id=current_user.id,
        version=(latest.version + 1) if latest else 1,
        summary=data.summary,
        artifact_urls=data.artifact_urls,
    )
    db.add(submission)
    task.status = "REVIEW"
    await db.flush()
    await record_activity(
        db,
        project.id,
        current_user.id,
        "WORK_SUBMITTED",
        {
            "task_id": str(task.id),
            "submission_id": str(submission.id),
            "version": submission.version,
        },
    )
    company = await db.scalar(select(CompanyProfile).where(CompanyProfile.id == project.company_id))
    if company and company.user_id != current_user.id:
        await notify_user(
            db,
            company.user_id,
            "Work submitted",
            f"New work was submitted for {task.title}.",
            "work_submission",
        )
    return submission


@router.get("/tasks/{task_id}/submissions")
async def list_task_submissions(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ProjectTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await require_project_access(task.project_id, current_user, db)
    return (
        (
            await db.execute(
                select(WorkSubmission)
                .where(WorkSubmission.task_id == task.id)
                .order_by(WorkSubmission.version.desc())
            )
        )
        .scalars()
        .all()
    )


@router.patch("/submissions/{submission_id}/review")
async def review_task_submission(
    submission_id: uuid.UUID,
    data: WorkSubmissionReview,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    submission = await db.get(WorkSubmission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    task = await db.get(ProjectTask, submission.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    project = await require_project_access(task.project_id, current_user, db)
    if data.status not in {"APPROVED", "CHANGES_REQUESTED"}:
        raise HTTPException(
            status_code=422, detail="Review status must be APPROVED or CHANGES_REQUESTED"
        )
    if submission.status not in {"SUBMITTED", "CHANGES_REQUESTED"}:
        raise HTTPException(status_code=409, detail="Submission is no longer reviewable")
    if data.status == "APPROVED":
        dependencies = (
            (await db.execute(select(TaskDependency).where(TaskDependency.task_id == task.id)))
            .scalars()
            .all()
        )
        prerequisite_ids = [dependency.depends_on_task_id for dependency in dependencies]
        if prerequisite_ids and await db.scalar(
            select(ProjectTask.id).where(
                ProjectTask.id.in_(prerequisite_ids), ProjectTask.status != "COMPLETED"
            )
        ):
            raise HTTPException(
                status_code=409, detail="Complete dependencies before approving this submission"
            )
        task.status = "COMPLETED"
        task.completed_at = datetime.utcnow()
    else:
        task.status = "IN_PROGRESS"
    submission.status = data.status
    submission.review_note = data.review_note
    submission.reviewed_by_id = current_user.id
    submission.reviewed_at = datetime.utcnow()
    await db.flush()
    await record_activity(
        db,
        project.id,
        current_user.id,
        f"WORK_{data.status}",
        {"task_id": str(task.id), "submission_id": str(submission.id)},
    )
    if task.assigned_user_id and task.assigned_user_id != current_user.id:
        await notify_user(
            db,
            task.assigned_user_id,
            f"Work {data.status.lower().replace('_', ' ')}",
            f"Your submission for {task.title} was reviewed.",
            "work_review",
        )
    return submission


@router.post("/submissions/{submission_id}/ai-review")
async def ai_review_submission(
    submission_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    submission = await db.get(WorkSubmission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    task = await db.get(ProjectTask, submission.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    project = await require_project_access(task.project_id, current_user, db)

    agent = QualityEngineAgent()
    artifacts_str = (
        f"\nArtifacts: {', '.join(submission.artifact_urls)}" if submission.artifact_urls else ""
    )
    review = await agent.evaluate_submission(
        task_title=task.title,
        task_description=task.description or "",
        submission_content=f"{submission.summary}{artifacts_str}",
        requirements=task.required_skills or [],
    )

    submission.quality_score = float(review.get("overall_score", 0.0))
    submission.ai_feedback = review.get("summary")
    await db.flush()
    await record_activity(
        db,
        project.id,
        current_user.id,
        "AI_WORK_REVIEWED",
        {
            "task_id": str(task.id),
            "submission_id": str(submission.id),
            "quality_score": submission.quality_score,
            "verdict": review.get("verdict"),
            "grade": review.get("grade"),
        },
    )
    return {"submission": submission, "review": review}


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: uuid.UUID,
    data: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ProjectTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    project = await require_project_access(task.project_id, current_user, db)
    updates = data.model_dump(exclude_unset=True)
    if updates.get("status") and updates["status"] not in TASK_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid task status")
    if updates.get("status") == "COMPLETED":
        dependencies = (
            (await db.execute(select(TaskDependency).where(TaskDependency.task_id == task.id)))
            .scalars()
            .all()
        )
        prerequisite_ids = [dependency.depends_on_task_id for dependency in dependencies]
        if prerequisite_ids:
            incomplete = (
                (
                    await db.execute(
                        select(ProjectTask).where(
                            ProjectTask.id.in_(prerequisite_ids), ProjectTask.status != "COMPLETED"
                        )
                    )
                )
                .scalars()
                .all()
            )
            if incomplete:
                raise HTTPException(status_code=409, detail="Complete dependencies first")
    for key, value in updates.items():
        setattr(task, key, value)
    if task.status == "COMPLETED":
        task.completed_at = datetime.utcnow()
    await record_activity(
        db, project.id, current_user.id, "TASK_UPDATED", {"task_id": str(task.id), **updates}
    )
    return task


@router.post("/tasks/{task_id}/dependencies", status_code=status.HTTP_201_CREATED)
async def add_task_dependency(
    task_id: uuid.UUID,
    data: TaskDependencyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ProjectTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    project = await require_project_access(task.project_id, current_user, db)
    if data.depends_on_task_id == task.id:
        raise HTTPException(status_code=422, detail="A task cannot depend on itself")
    prerequisite = await db.get(ProjectTask, data.depends_on_task_id)
    if not prerequisite or prerequisite.project_id != project.id:
        raise HTTPException(
            status_code=422, detail="Dependency must be another task in the same project"
        )
    existing = await db.scalar(
        select(TaskDependency).where(
            TaskDependency.task_id == task.id, TaskDependency.depends_on_task_id == prerequisite.id
        )
    )
    if existing:
        return existing
    dependency = TaskDependency(task_id=task.id, depends_on_task_id=prerequisite.id)
    db.add(dependency)
    await db.flush()
    await record_activity(
        db,
        project.id,
        current_user.id,
        "TASK_DEPENDENCY_ADDED",
        {"task_id": str(task.id), "depends_on_task_id": str(prerequisite.id)},
    )
    return dependency


@router.post("/tasks/{task_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_task_comment(
    task_id: uuid.UUID,
    data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ProjectTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    project = await require_project_access(task.project_id, current_user, db)
    comment = TaskComment(task_id=task.id, author_id=current_user.id, content=data.content)
    db.add(comment)
    await db.flush()
    await record_activity(
        db, project.id, current_user.id, "TASK_COMMENTED", {"task_id": str(task.id)}
    )
    return comment


@router.post("/{project_id}/plan")
async def generate_project_plan(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(project_id, current_user, db)
    project.status = "PLANNING"
    response = await AIService().analyze(
        f"Project title: {project.title}\nDescription: {project.description}\nTechnologies: {project.technologies}\nTimeline: {project.timeline}",
        "Create a project delivery plan. Return JSON with milestones (array of objects with title, description, position), tasks (array of objects with title, description, milestone, required_skills, priority, estimated_hours), timeline, dependencies, and summary.",
    )
    plan = response.data
    if not plan:
        raise HTTPException(status_code=503, detail="AI provider is not configured")
    report = AIReport(
        project_id=project.id,
        user_id=current_user.id,
        report_type="PROJECT_PLAN",
        payload=plan,
        content=plan.get("summary"),
    )
    db.add(report)
    await record_activity(db, project.id, current_user.id, "AI_PLAN_GENERATED")
    return {"project": project, "plan": plan, "report": report}


@router.post("/{project_id}/approve-plan")
async def approve_project_plan(
    project_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(project_id, current_user, db)
    latest_plan = await db.scalar(
        select(AIReport)
        .where(AIReport.project_id == project.id, AIReport.report_type == "PROJECT_PLAN")
        .order_by(AIReport.created_at.desc())
    )
    if not latest_plan:
        raise HTTPException(status_code=409, detail="Generate a project plan before approving it")
    if project.status == "ACTIVE":
        return project

    plan = latest_plan.payload or {}
    milestones = (
        (await db.execute(select(Milestone).where(Milestone.project_id == project.id)))
        .scalars()
        .all()
    )
    tasks = (
        (await db.execute(select(ProjectTask).where(ProjectTask.project_id == project.id)))
        .scalars()
        .all()
    )
    if not milestones and not tasks:
        for item in plan.get("milestones", []):
            db.add(
                Milestone(
                    project_id=project.id,
                    title=item.get("title", "Milestone"),
                    description=item.get("description"),
                    position=item.get("position", 0),
                )
            )
        for item in plan.get("tasks", []):
            db.add(
                ProjectTask(
                    project_id=project.id,
                    title=item.get("title", "Task"),
                    description=item.get("description"),
                    milestone=item.get("milestone"),
                    required_skills=item.get("required_skills", []),
                    priority=item.get("priority", "MEDIUM"),
                    estimated_hours=item.get("estimated_hours"),
                )
            )
    project.status = "ACTIVE"
    await record_activity(db, project.id, current_user.id, "PROJECT_PLAN_APPROVED")
    await db.flush()
    return project


@router.get("/{project_id}/ai-report")
async def list_ai_reports(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_project_access(project_id, current_user, db)
    return (
        (
            await db.execute(
                select(AIReport)
                .where(AIReport.project_id == project_id)
                .order_by(AIReport.created_at.desc())
            )
        )
        .scalars()
        .all()
    )


async def create_ai_report(
    project: Project,
    current_user: User,
    db: AsyncSession,
    report_type: str,
    prompt: str,
    system_prompt: str,
) -> AIReport:
    response = await AIService().analyze(prompt, system_prompt)
    if not response.data:
        raise HTTPException(status_code=503, detail="AI provider is not configured")
    report = AIReport(
        project_id=project.id,
        user_id=current_user.id,
        report_type=report_type,
        payload=response.data,
        content=response.data.get("summary"),
    )
    db.add(report)
    await db.flush()
    await record_activity(db, project.id, current_user.id, f"AI_{report_type}_GENERATED")
    return report


@router.post("/{project_id}/ai/progress-summary")
async def generate_progress_summary(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(project_id, current_user, db)
    tasks = (
        (await db.execute(select(ProjectTask).where(ProjectTask.project_id == project.id)))
        .scalars()
        .all()
    )
    report = await create_ai_report(
        project,
        current_user,
        db,
        "PROGRESS_SUMMARY",
        f"Project: {project.title}\nTasks: {[{'title': t.title, 'status': t.status, 'deadline': str(t.deadline)} for t in tasks]}",
        "Summarize project progress. Return JSON with summary, completed_tasks, pending_tasks, delayed_tasks, and recommendations.",
    )
    return report


@router.post("/{project_id}/ai/risk-analysis")
async def generate_risk_analysis(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(project_id, current_user, db)
    tasks = (
        (await db.execute(select(ProjectTask).where(ProjectTask.project_id == project.id)))
        .scalars()
        .all()
    )
    report = await create_ai_report(
        project,
        current_user,
        db,
        "RISK_ANALYSIS",
        f"Project: {project.title}\nTasks: {[{'title': t.title, 'status': t.status, 'deadline': str(t.deadline)} for t in tasks]}",
        "Analyze delivery risks. Return JSON with risk_level, reason, delayed_tasks, blocked_tasks, and recommendations.",
    )
    return report


@router.post("/{project_id}/ai/documentation")
async def generate_documentation(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(project_id, current_user, db)
    report = await create_ai_report(
        project,
        current_user,
        db,
        "DOCUMENTATION",
        f"Project: {project.title}\nDescription: {project.description}\nTechnologies: {project.technologies}",
        "Generate concise technical documentation. Return JSON with summary, architecture, setup, and release_notes.",
    )
    return report


@router.get("/{project_id}/activity")
async def list_project_activity(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_project_access(project_id, current_user, db)
    return (
        (
            await db.execute(
                select(ProjectActivity)
                .where(ProjectActivity.project_id == project_id)
                .order_by(ProjectActivity.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
