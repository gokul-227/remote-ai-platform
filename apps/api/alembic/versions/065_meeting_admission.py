"""Meeting passcodes and bounded host admission.

Revision ID: 065_meeting_admission
Revises: 064_incidents
"""

import sqlalchemy as sa

from alembic import op

revision = "065_meeting_admission"
down_revision = "064_incidents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meetings", sa.Column("passcode_hash", sa.String(256), nullable=True))
    op.add_column(
        "meetings",
        sa.Column("waiting_room", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "meeting_participants",
        sa.Column("admission", sa.String(16), server_default="NONE", nullable=False),
    )
    op.add_column(
        "meeting_participants",
        sa.Column("passcode_attempts", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("meeting_participants", "passcode_attempts")
    op.drop_column("meeting_participants", "admission")
    op.drop_column("meetings", "waiting_room")
    op.drop_column("meetings", "passcode_hash")
