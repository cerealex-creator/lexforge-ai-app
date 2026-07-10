"""document_tasks.review_position for role-specific prompts."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "011_review_position"
down_revision: Union[str, None] = "010_review_multi_agent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "document_tasks",
        sa.Column("review_position", sa.String(32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("document_tasks", "review_position")

