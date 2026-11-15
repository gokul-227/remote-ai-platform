"""Merge independently developed source-board and catalogue-scale migrations.

Both parents are additive. No data or schema changes are needed at the merge.
"""

revision = "076_merge_scale_and_boards"
down_revision = ("075_job_source_boards", "075_scale_read_models")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
