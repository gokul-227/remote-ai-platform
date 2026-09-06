"""
Trust & Reputation domain FastAPI router.

Exposes endpoints for calculating explainable trust scores, submitting peer reviews,
and managing verification badges.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit_event
from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.projects.models import ProjectMember, ProjectReview
from app.domains.projects.router import require_project_access
from app.domains.trust.models import UserVerification
from app.domains.trust.schemas import (
    ProjectReviewResponse,
    ReviewCreate,
    ReviewerSummary,
    TrustScoreResponse,
    VerificationCreate,
    VerificationResponse,
    VerificationReviewUpdate,
)
from app.domains.trust.service import TrustService
from app.services.notifications import notify_user

router = APIRouter(prefix="/trust", tags=["Trust & Reputation"])


def _reviewer_summary(user: User) -> ReviewerSummary:
    return ReviewerSummary(
        id=user.id,
        full_name=user.full_name,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
    )


@router.get(
    "/scores/{user_id}", response_model=TrustScoreResponse, summary="Get explainable trust score"
)
async def get_user_trust_score(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> TrustScoreResponse:
    """Calculate and return explainable trust score for any user."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    score_record = await TrustService.calculate_trust_score(user_id, db)
    return TrustScoreResponse.model_validate(score_record)


@router.get(
    "/reviews/{user_id}", response_model=list[ProjectReviewResponse], summary="List user reviews"
)
async def get_user_reviews(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[ProjectReviewResponse]:
    """Get project reviews received by a user."""
    result = await db.execute(
        select(ProjectReview)
        .where(ProjectReview.reviewee_id == user_id)
        .order_by(ProjectReview.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    reviews = result.scalars().all()

    # Enrich reviewer info
    reviewer_ids = list({r.reviewer_id for r in reviews})
    reviewers_res = await db.execute(select(User).where(User.id.in_(reviewer_ids)))
    reviewers = {u.id: u for u in reviewers_res.scalars().all()}

    return [
        ProjectReviewResponse(
            id=r.id,
            project_id=r.project_id,
            reviewer_id=r.reviewer_id,
            reviewee_id=r.reviewee_id,
            reviewer=_reviewer_summary(reviewers[r.reviewer_id])
            if r.reviewer_id in reviewers
            else None,
            rating=r.rating,
            comment=r.comment,
            created_at=r.created_at,
        )
        for r in reviews
    ]


@router.post(
    "/reviews",
    status_code=status.HTTP_201_CREATED,
    response_model=ProjectReviewResponse,
    summary="Submit project review",
)
async def submit_review(
    data: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectReviewResponse:
    """Submit a peer review for a completed project or engagement.

    Reviews feed directly into TrustService.calculate_trust_score, so this endpoint
    must only accept reviews from someone who actually participated in the project,
    about someone who was actually on the other side of it — otherwise any
    authenticated user could inflate or deflate an arbitrary user's trust score.
    These checks mirror POST /projects/{project_id}/reviews.
    """
    if data.reviewee_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot review yourself"
        )

    # current_user must actually be a participant of the project (company owner,
    # admin, or a project member) — not just any authenticated user.
    project = await require_project_access(data.project_id, current_user, db)

    if project.status != "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reviews are available after project completion",
        )

    reviewee = await db.get(User, data.reviewee_id)
    if not reviewee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reviewee user not found")

    # The reviewee must also actually be part of this project, not an arbitrary user.
    if reviewee.role == UserRole.COMPANY:
        reviewee_company = await db.scalar(
            select(CompanyProfile).where(
                CompanyProfile.user_id == reviewee.id, CompanyProfile.id == project.company_id
            )
        )
        if not reviewee_company:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Review recipient is not part of this project",
            )
    elif not await db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project.id, ProjectMember.user_id == reviewee.id
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Review recipient is not part of this project",
        )

    # Check for duplicate review
    existing = await db.scalar(
        select(ProjectReview).where(
            ProjectReview.project_id == data.project_id,
            ProjectReview.reviewer_id == current_user.id,
            ProjectReview.reviewee_id == data.reviewee_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already reviewed this user for this project",
        )

    review = ProjectReview(
        project_id=data.project_id,
        reviewer_id=current_user.id,
        reviewee_id=data.reviewee_id,
        rating=data.rating,
        comment=data.comment,
    )
    db.add(review)
    await db.flush()

    # Recalculate trust score
    await TrustService.calculate_trust_score(data.reviewee_id, db)

    await notify_user(
        db,
        data.reviewee_id,
        "New Project Review",
        f"{current_user.full_name} left you a {data.rating}-star review.",
        "project_review",
    )

    return ProjectReviewResponse(
        id=review.id,
        project_id=review.project_id,
        reviewer_id=review.reviewer_id,
        reviewee_id=review.reviewee_id,
        reviewer=_reviewer_summary(current_user),
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
    )


@router.get(
    "/verifications/{user_id}",
    response_model=list[VerificationResponse],
    summary="List user verifications",
)
async def get_verifications(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[VerificationResponse]:
    result = await db.execute(
        select(UserVerification)
        .where(UserVerification.user_id == user_id)
        .order_by(UserVerification.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    verifications = result.scalars().all()
    return [VerificationResponse.model_validate(v) for v in verifications]


@router.post(
    "/verifications",
    status_code=status.HTTP_201_CREATED,
    response_model=VerificationResponse,
    summary="Add verification badge",
)
async def create_verification(
    data: VerificationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VerificationResponse:
    """Submit a credential for verification.

    This only records the user's own claim — no evidence is checked here, so
    the badge starts as SELF_REPORTED. It becomes VERIFIED only once an admin
    reviews it via PATCH /verifications/{id}/review; see that endpoint and
    TrustService.calculate_trust_score, which only awards verification points
    for status == "VERIFIED".
    """
    verification = UserVerification(
        user_id=current_user.id,
        verification_type=data.verification_type,
        status="SELF_REPORTED",
        verifier_notes=data.verifier_notes,
    )
    db.add(verification)
    await db.flush()
    await db.refresh(verification)

    return VerificationResponse.model_validate(verification)


@router.patch(
    "/verifications/{verification_id}/review",
    response_model=VerificationResponse,
    summary="Admin: verify or reject a submitted credential",
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def review_verification(
    verification_id: uuid.UUID,
    data: VerificationReviewUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VerificationResponse:
    """Move a SELF_REPORTED/PENDING credential to VERIFIED or REJECTED.

    This is the only path that produces a "VERIFIED" badge — it requires
    actual admin review, backed by an audit event, rather than the user's
    own submission.
    """
    verification = await db.get(UserVerification, verification_id)
    if not verification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verification not found")

    verification.status = data.status
    verification.verifier_notes = data.verifier_notes or verification.verifier_notes
    verification.reviewed_by_id = current_user.id
    verification.verified_at = func.now() if data.status == "VERIFIED" else None
    await db.flush()
    await db.refresh(verification)

    await record_audit_event(
        db,
        action=f"trust.verification.{data.status.lower()}",
        resource_type="user_verification",
        resource_id=str(verification.id),
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        payload={"user_id": str(verification.user_id), "verification_type": verification.verification_type},
    )

    # Recalculate trust score now that verification status may have changed
    await TrustService.calculate_trust_score(verification.user_id, db)

    await notify_user(
        db,
        verification.user_id,
        "Verification Reviewed",
        f"Your {verification.verification_type} credential was {data.status.lower()}.",
        "verification_review",
    )

    return VerificationResponse.model_validate(verification)
