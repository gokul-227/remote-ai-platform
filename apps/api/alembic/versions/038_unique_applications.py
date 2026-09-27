"""One application per person per job.

Revision ID: 038_unique_applications
Revises: 037_deleted_identities

POST /applications/jobs/{id} checked for an existing application and then
inserted, so a double click or a retried request could create two. The
invariant (invitations update the existing row) is now a constraint.

Applications are business records, so this migration refuses to run if
duplicates exist instead of deleting any: resolve them by hand (keep the
most advanced status) and deploy again.

(post_likes needs nothing: its primary key is already (post_id, user_id).)
"""

from alembic import op
import sqlalchemy as sa


revision = "038_unique_applications"
down_revision = "037_deleted_identities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    duplicates = op.get_bind().execute(
        sa.text(
            "SELECT count(*) FROM (SELECT user_id, job_id FROM job_applications "
            "GROUP BY user_id, job_id HAVING count(*) > 1) d"
        )
    ).scalar_one()
    if duplicates:
        raise RuntimeError(
            f"{duplicates} (user, job) pairs have more than one application; "
            "resolve them manually before adding uq_job_application_user_job"
        )
    op.create_unique_constraint("uq_job_application_user_job", "job_applications", ["user_id", "job_id"])


def downgrade() -> None:
    op.drop_constraint("uq_job_application_user_job", "job_applications", type_="unique")
