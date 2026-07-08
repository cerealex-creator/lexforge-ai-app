"""Reference documents (company templates/checklists) for contract review."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "005_reference_documents"
down_revision: Union[str, None] = "004_comparison_tasks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN CREATE TYPE reference_category AS ENUM ('standard_contract', 'checklist', 'compliance');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)

    op.create_table(
        "reference_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column(
            "category",
            postgresql.ENUM("standard_contract", "checklist", "compliance", name="reference_category", create_type=False),
            nullable=False,
            server_default="standard_contract",
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    op.add_column(
        "document_tasks",
        sa.Column(
            "reference_document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("reference_documents.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("document_tasks", "reference_document_id")
    op.drop_table("reference_documents")
    op.execute("DROP TYPE IF EXISTS reference_category")
