"""Counterparty checks by INN."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "007_counterparty_checks"
down_revision: Union[str, None] = "006_deadline_extractions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    task_status = postgresql.ENUM(
        "pending", "processing", "completed", "failed", name="task_status", create_type=False
    )

    op.create_table(
        "counterparty_checks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inn", sa.String(12), nullable=False),
        sa.Column("status", task_status, nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("result_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_counterparty_checks_company_id", "counterparty_checks", ["company_id"])
    op.create_index("ix_counterparty_checks_inn", "counterparty_checks", ["inn"])


def downgrade() -> None:
    op.drop_index("ix_counterparty_checks_inn", table_name="counterparty_checks")
    op.drop_index("ix_counterparty_checks_company_id", table_name="counterparty_checks")
    op.drop_table("counterparty_checks")

