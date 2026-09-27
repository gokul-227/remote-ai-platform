"""What "download my data" returns (GDPR access and portability, DATA-02).

An explicit list, not a walk over every foreign key: a row is exported only
when the user is its *subject* (owner, author, participant, recipient), never
merely because they reviewed or moderated it, and each table drops columns
that are capabilities, provider internals, or other people's/staff details.
`tests/test_data_export.py` fails when a table that references users or
profiles is neither exported nor listed in EXCLUDED with a reason.
"""

import enum
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Table, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.domains.billing.models  # noqa: F401  (registers subscriptions; not imported by app.main)
from app.core.database import Base
from app.domains.auth.models import User


@dataclass(frozen=True)
class Source:
    """Rows of `table` where any `by` column equals the given scope's id."""

    table: str
    by: tuple[str, ...]
    scope: str = "user"  # "user" | "engineer_profile" | "company_profile" | "conversation"
    drop: frozenset[str] = field(default_factory=frozenset)


# Capabilities and provider internals, never personal data.
_ALWAYS_DROP = frozenset({"resume_url", "auth_subject", "idempotency_key", "provider_reference"})

SOURCES: tuple[Source, ...] = (
    Source("engineer_profiles", ("user_id",)),
    Source("company_profiles", ("user_id",)),
    Source("user_skills", ("user_id",)),
    Source("user_trust_scores", ("user_id",)),
    Source("user_verifications", ("user_id",), drop=frozenset({"reviewed_by_id"})),
    Source("notifications", ("user_id",)),
    Source("saved_jobs", ("user_id",)),
    Source("job_applications", ("user_id",)),
    Source("recommendations", ("user_id",)),
    Source("job_matches", ("engineer_id",), scope="engineer_profile"),
    Source("ai_usage_logs", ("user_id",)),
    Source("ai_reports", ("user_id",)),
    Source("posts", ("author_id",)),
    Source("post_comments", ("author_id",)),
    Source("post_likes", ("user_id",)),
    Source("groups", ("owner_id",)),
    Source("group_memberships", ("user_id",)),
    Source("group_posts", ("author_id",)),
    Source("connections", ("sender_id", "receiver_id")),
    Source("user_blocks", ("blocker_id",)),
    Source("conversations", ("participant_one_id", "participant_two_id")),
    # Both directions of the user's own conversations.
    Source("messages", ("conversation_id",), scope="conversation"),
    Source("contracts", ("client_id", "worker_id")),
    Source("project_members", ("user_id",)),
    Source("project_tasks", ("assigned_user_id",)),
    Source("project_activity", ("actor_id",)),
    Source("project_reviews", ("reviewer_id", "reviewee_id")),
    Source("task_comments", ("author_id",)),
    Source("task_assignment_offers", ("candidate_user_id",)),
    Source("work_submissions", ("submitted_by_id",), drop=frozenset({"reviewed_by_id"})),
    Source("work_ledger_entries", ("worker_id",), drop=frozenset({"voided_by_id"})),
    Source("payment_transactions", ("payer_id", "payee_id")),
    Source("subscriptions", ("user_id",), drop=frozenset({"stripe_customer_id", "stripe_subscription_id"})),
    # Reports the user made; who reviewed them and the moderator's notes stay internal.
    Source("moderation_reports", ("reporter_id",), drop=frozenset({"reviewed_by_id", "decision_note"})),
    Source("analytics_events", ("user_id",)),
    Source("audit_events", ("actor_id",), drop=frozenset({"payload"})),
    # The user's organisation's own postings and projects.
    Source("job_posts", ("company_id",), scope="company_profile"),
    Source("projects", ("company_id",), scope="company_profile"),
)

# User/profile-linked columns deliberately not used to select rows.
EXCLUDED: dict[tuple[str, str], str] = {
    ("user_verifications", "reviewed_by_id"): "verifications the user reviewed as staff are other people's data",
    ("work_submissions", "reviewed_by_id"): "submissions the user reviewed belong to the submitter",
    ("work_ledger_entries", "voided_by_id"): "entries the user voided belong to the worker",
    ("moderation_reports", "reviewed_by_id"): "reports the user moderated would identify other reporters",
    ("task_assignment_offers", "offered_by_id"): "offers made as an organisation hold the candidate's match data",
    ("recommendations", "engineer_id"): "already exported through user_id",
    ("messages", "sender_id"): "exported through the user's conversations, in both directions",
    ("user_blocks", "blocked_id"): "who blocked the user is never revealed",
}


def _jsonable(value: object) -> object:
    if isinstance(value, uuid.UUID | datetime):
        return str(value)
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, Decimal):
        return str(value)
    return value


async def build_export(db: AsyncSession, user: User) -> dict[str, Any]:
    tables = Base.metadata.tables
    engineer = tables["engineer_profiles"]
    company = tables["company_profiles"]
    conversations = tables["conversations"]
    scopes: dict[str, Any] = {
        "user": [user.id],
        "engineer_profile": select(engineer.c.id).where(engineer.c.user_id == user.id),
        "company_profile": select(company.c.id).where(company.c.user_id == user.id),
        "conversation": select(conversations.c.id).where(
            or_(conversations.c.participant_one_id == user.id, conversations.c.participant_two_id == user.id)
        ),
    }
    data: dict[str, Any] = {}
    for source in SOURCES:
        table: Table | None = tables.get(source.table)
        if table is None:
            continue
        scope = scopes[source.scope]
        clauses = [table.c[col].in_(scope) for col in source.by]
        rows = (await db.execute(select(table).where(or_(*clauses)))).mappings().all()
        if rows:
            drop = _ALWAYS_DROP | source.drop
            data[source.table] = [{k: _jsonable(v) for k, v in row.items() if k not in drop} for row in rows]
    return data


def exported_columns() -> set[tuple[str, str]]:
    """(table, column) pairs that select rows for the export."""
    return {(s.table, c) for s in SOURCES for c in s.by}


def export_generated_at() -> str:
    return datetime.now(UTC).isoformat()
