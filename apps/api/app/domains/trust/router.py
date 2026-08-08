"""
Trust & Reputation domain FastAPI router.

Exposes endpoints for calculating explainable trust scores, submitting peer reviews,
and managing verification badges.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.projects.models import Project, ProjectReview
from app.domains.trust.models import UserTrustScore, UserVerification
from app.domains.trust.schemas import (
    ProjectReviewResponse,
    ReviewCreate,
    ReviewerSummary,
    TrustScoreResponse,
    VerificationCreate,
    VerificationResponse,
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


@router.get("/scores/{user_id}", response_model=TrustScoreResponse, summary="Get explainable trust score")
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


@router.get("/reviews/{user_id}", response_model=list[ProjectReviewResponse], summary="List user reviews")
async def get_user_reviews(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[ProjectReviewResponse]:
    """Get project reviews received by a user."""
    result = await db.execute(
        select(ProjectReview).where(ProjectReview.reviewee_id == user_id).order_by(ProjectReview.created_at.desc())
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
            reviewer=_reviewer_summary(reviewers[r.reviewer_id]) if r.reviewer_id in reviewers else None,
            rating=r.rating,
            comment=r.comment,
            created_at=r.created_at,
        )
        for r in reviews
    ]


@router.post("/reviews", status_code=status.HTTP_201_CREATED, response_model=ProjectReviewResponse, summary="Submit project review")
async def submit_review(
    data: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectReviewResponse:
    """Submit a peer review for a completed project or engagement."""
    if data.reviewee_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot review yourself")

    project = await db.get(Project, data.project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    reviewee = await db.get(User, data.reviewee_id)
    if not reviewee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reviewee user not found")

    # Check for duplicate review
    existing = await db.scalar(
        select(ProjectReview).where(
            ProjectReview.project_id == data.project_id,
            ProjectReview.reviewer_id == current_user.id,
            ProjectReview.reviewee_id == data.reviewee_id,
        )
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already reviewed this user for this project")

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


@router.get("/verifications/{user_id}", response_model=list[VerificationResponse], summary="List user verifications")
async def get_verifications(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[VerificationResponse]:
    result = await db.execute(
        select(UserVerification).where(UserVerification.user_id == user_id).order_by(UserVerification.created_at.desc())
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
    """Request or self-verify identity/credentials badge."""
    verification = UserVerification(
        user_id=current_user.id,
        verification_type=data.verification_type,
        status="VERIFIED",  # Auto-verify in development/MVP
        verifier_notes=data.verifier_notes or f"Verified {data.verification_type} credential",
        verified_at=func.now(),
    )
    db.add(verification)
    await db.flush()
    await db.refresh(verification)

    # Recalculate trust score
    await TrustService.calculate_trust_score(current_user.id, db)

    return VerificationResponse.model_validate(verification)
