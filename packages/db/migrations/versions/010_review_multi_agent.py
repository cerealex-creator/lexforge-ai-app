"""document_tasks.multi_agent flag."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "010_review_multi_agent"
down_revision: Union[str, None] = "009_legal_work_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "document_tasks",
        sa.Column("multi_agent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("document_tasks", "multi_agent")
