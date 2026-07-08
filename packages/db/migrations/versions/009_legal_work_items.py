"""Phase 4: legal work items (memo, decision review, claim, objection)."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "009_legal_work_items"
down_revision: Union[str, None] = "008_doc_chunks_vec1024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    task_status = postgresql.ENUM(
        "pending", "processing", "completed", "failed", name="task_status", create_type=False
    )
    legal_work_kind = postgresql.ENUM(
        "memo", "decision_review", "claim", "objection", name="legal_work_kind", create_type=False
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE legal_work_kind AS ENUM ('memo', 'decision_review', 'claim', 'objection');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    op.create_table(
        "legal_work_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", legal_work_kind, nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("status", task_status, nullable=False, server_default="pending"),
        sa.Column("input_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("result_json", postgresql.JSONB(), nullable=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_legal_work_items_company_id", "legal_work_items", ["company_id"])
    op.create_index("ix_legal_work_items_kind", "legal_work_items", ["kind"])


def downgrade() -> None:
    op.drop_index("ix_legal_work_items_kind", table_name="legal_work_items")
    op.drop_index("ix_legal_work_items_company_id", table_name="legal_work_items")
    op.drop_table("legal_work_items")
    op.execute("DROP TYPE IF EXISTS legal_work_kind")
