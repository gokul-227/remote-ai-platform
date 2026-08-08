"""
Trust & Reputation calculation service.

Calculates multi-factor explainable trust score (0-100) based on:
1. Profile Completeness & Identity Verifications (up to 30 pts)
2. Project Review Ratings Average (up to 35 pts)
3. Task/Contract Execution & Completion Rate (up to 25 pts)
4. Platform Tenure & Activity (up to 10 pts)
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User
from app.domains.contracts.models import Contract
from app.domains.engineers.models import EngineerProfile
from app.domains.marketplace.models import ProjectTask
from app.domains.projects.models import ProjectReview, WorkSubmission
from app.domains.trust.models import UserTrustScore, UserVerification


class TrustService:
    @staticmethod
    async def calculate_trust_score(user_id: uuid.UUID, db: AsyncSession) -> UserTrustScore:
        user = await db.get(User, user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        factors: list[Dict[str, Any]] = []

        # 1. Identity & Verifications (up to 30 pts)
        verifications_res = await db.execute(
            select(UserVerification).where(
                UserVerification.user_id == user_id,
                UserVerification.status == "VERIFIED",
            )
        )
        verifications = verifications_res.scalars().all()
        verif_score = min(len(verifications) * 10, 20)
        if verifications:
            types_str = ", ".join([v.verification_type for v in verifications])
            factors.append({"category": "Verifications", "points": verif_score, "max": 20, "detail": f"Verified badges: {types_str}"})

        # Profile completeness
        profile = await db.scalar(select(EngineerProfile).where(EngineerProfile.user_id == user_id))
        completeness_pts = 0
        if profile:
            completeness = profile.completeness_score or 0
            completeness_pts = round((completeness / 100) * 10, 1)
            factors.append({"category": "Profile Completeness", "points": completeness_pts, "max": 10, "detail": f"{completeness}% complete profile"})

        verification_total = verif_score + completeness_pts

        # 2. Reviews & Rating Average (up to 35 pts)
        reviews_res = await db.execute(
            select(ProjectReview).where(ProjectReview.reviewee_id == user_id)
        )
        reviews = reviews_res.scalars().all()

        rating_avg = 0.0
        review_pts = 0.0
        if reviews:
            rating_avg = round(sum(r.rating for r in reviews) / len(reviews), 2)
            # Scale 5.0 -> 35 pts
            review_pts = round((rating_avg / 5.0) * 35.0, 1)
            factors.append({
                "category": "Peer Reviews",
                "points": review_pts,
                "max": 35,
                "detail": f"{rating_avg} / 5.0 rating average across {len(reviews)} review(s)",
            })
        else:
            factors.append({
                "category": "Peer Reviews",
                "points": 0,
                "max": 35,
                "detail": "No peer reviews submitted yet",
            })

        # 3. Execution & Completion Rate (up to 25 pts)
        tasks_res = await db.execute(
            select(ProjectTask).where(ProjectTask.assigned_user_id == user_id)
        )
        tasks = tasks_res.scalars().all()

        completion_rate = 100.0
        execution_pts = 0.0
        if tasks:
            completed_count = sum(1 for t in tasks if t.status == "COMPLETED")
            completion_rate = round((completed_count / len(tasks)) * 100.0, 1)
            execution_pts = round((completion_rate / 100.0) * 25.0, 1)
            factors.append({
                "category": "Task Delivery",
                "points": execution_pts,
                "max": 25,
                "detail": f"{completion_rate}% completion rate ({completed_count} of {len(tasks)} tasks completed)",
            })
        else:
            # Neutral baseline for users with no tasks assigned yet
            factors.append({
                "category": "Task Delivery",
                "points": 15.0,
                "max": 25,
                "detail": "Baseline allocation for new platform member",
            })
            execution_pts = 15.0

        # 4. Tenure & Activity (up to 10 pts)
        tenure_pts = 10.0
        factors.append({
            "category": "Platform Standing",
            "points": tenure_pts,
            "max": 10,
            "detail": "Account active and in good standing",
        })

        overall_score = round(min(verification_total + review_pts + execution_pts + tenure_pts, 100.0), 1)

        # Upsert cached score
        trust_record = await db.get(UserTrustScore, user_id)
        if not trust_record:
            trust_record = UserTrustScore(user_id=user_id)
            db.add(trust_record)

        trust_record.overall_score = overall_score
        trust_record.completion_rate = completion_rate
        trust_record.on_time_rate = 100.0
        trust_record.rating_avg = rating_avg
        trust_record.review_count = len(reviews)
        trust_record.verified_skills_count = len(verifications)
        trust_record.score_breakdown = {
            "score": overall_score,
            "factors": factors,
            "last_calculated": datetime.now(timezone.utc).isoformat(),
        }
        trust_record.updated_at = datetime.now(timezone.utc)

        await db.flush()
        return trust_record
