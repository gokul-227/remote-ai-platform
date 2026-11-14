"""Connect signed engagements to existing project workspaces transactionally."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.contracts.models import Contract, ContractMilestone
from app.domains.deliverables.models import Deliverable
from app.domains.marketplace.models import ProjectTask
from app.domains.projects.models import Milestone, Project, ProjectMember


async def activate_workspace(db: AsyncSession, contract: Contract) -> None:
    if contract.project_id is None:
        return
    project = await db.scalar(select(Project).where(Project.id == contract.project_id).with_for_update())
    if project is None or project.is_deleted or project.status in {"COMPLETED", "CANCELLED"}:
        raise HTTPException(409, "The project workspace is no longer open")
    member = await db.get(ProjectMember, (project.id, contract.worker_id))
    if member is None:
        db.add(ProjectMember(project_id=project.id, user_id=contract.worker_id, role="WORKER"))
    milestones = (await db.scalars(select(ContractMilestone).where(
        ContractMilestone.contract_id == contract.id
    ))).all()
    for position, milestone in enumerate(milestones):
        linked = await db.scalar(select(Milestone.id).where(
            Milestone.contract_milestone_id == milestone.id
        ))
        if linked is None:
            db.add(Milestone(
                project_id=project.id, contract_milestone_id=milestone.id,
                title=milestone.title, amount=milestone.amount, due_date=milestone.due_date,
                position=position, status="TODO",
            ))
    if project.contract_id is None:
        project.contract_id = contract.id
    if project.status in {"CREATED", "PLANNING"}:
        project.status = "ACTIVE"


async def ensure_engagement_complete(db: AsyncSession, contract: Contract) -> None:
    if contract.status != "ACTIVE":
        raise HTTPException(409, "Only an active contract can be completed")
    unfinished = await db.scalar(select(ContractMilestone.id).where(
        ContractMilestone.contract_id == contract.id,
        ContractMilestone.status.not_in({"APPROVED", "PAID"}),
    ))
    pending_review = await db.scalar(select(Deliverable.id).where(
        Deliverable.contract_id == contract.id, Deliverable.status == "SUBMITTED",
    ))
    if unfinished or pending_review:
        raise HTTPException(409, "Approve all milestones and review outstanding deliverables first")
    if contract.project_id is not None:
        open_task = await db.scalar(select(ProjectTask.id).where(
            ProjectTask.project_id == contract.project_id,
            ProjectTask.assigned_user_id == contract.worker_id,
            ProjectTask.status != "COMPLETED",
        ))
        if open_task:
            raise HTTPException(409, "Complete the professional's assigned project tasks first")
