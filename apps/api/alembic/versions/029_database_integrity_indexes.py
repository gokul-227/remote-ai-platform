"""Add missing indexes on confirmed hot-path filter columns.

Revision ID: 029_database_integrity_indexes
Revises: 028_payment_idempotency_key

Part of a database-integrity audit (Phase 4). Each index here is backed by an
actual `.where()`/`.filter()` clause found in the corresponding repository or
router, not a speculative "just in case" addition:

- payment_transactions.payer_id / payee_id: filtered directly in
  payments/router.py (wallet balance, transaction history, escrow
  idempotency lookup) but had no index despite being FK columns.
- notifications (user_id, is_read) composite: list_notifications(),
  unread_count(), and mark_all_read() in notifications/router.py all filter
  on this pair together.
- engineer_profiles.is_public: EngineerRepository.search() applies
  `is_public.is_(True)` as its unconditional base filter.
- company_profiles.is_verified: CompanyRepository.list_companies() filters
  on this when the `is_verified` query param is supplied.
- groups.is_private: list_groups() applies `is_private.is_(False)` as its
  unconditional base filter.

(groups.category already had an index created directly in
022_groups.py -- the model just lacked the matching `index=True`, now
fixed so the ORM model reflects the real schema. No new index needed there.)

Autogenerate against this schema also surfaces a large amount of unrelated
diff noise (composite indexes hand-added in 018_performance_indexes.py /
026_performance_and_soft_deletes.py that aren't declared in any model's
`__table_args__`, and a couple of `UniqueConstraint`-vs-index naming
mismatches on groups.slug / skills.name). That drift predates this change,
is unrelated to the indexes below, and is intentionally left untouched here
to keep this migration focused and low-risk -- see the PR description.
"""

from alembic import op


revision = "029_database_integrity_indexes"
down_revision = "028_payment_idempotency_key"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_payment_transactions_payer_id", "payment_transactions", ["payer_id"]
    )
    op.create_index(
        "ix_payment_transactions_payee_id", "payment_transactions", ["payee_id"]
    )
    op.create_index(
        "ix_notifications_user_id_is_read", "notifications", ["user_id", "is_read"]
    )
    op.create_index(
        "ix_engineer_profiles_is_public", "engineer_profiles", ["is_public"]
    )
    op.create_index(
        "ix_company_profiles_is_verified", "company_profiles", ["is_verified"]
    )
    op.create_index("ix_groups_is_private", "groups", ["is_private"])


def downgrade() -> None:
    op.drop_index("ix_groups_is_private", table_name="groups")
    op.drop_index("ix_company_profiles_is_verified", table_name="company_profiles")
    op.drop_index("ix_engineer_profiles_is_public", table_name="engineer_profiles")
    op.drop_index("ix_notifications_user_id_is_read", table_name="notifications")
    op.drop_index("ix_payment_transactions_payee_id", table_name="payment_transactions")
    op.drop_index("ix_payment_transactions_payer_id", table_name="payment_transactions")
