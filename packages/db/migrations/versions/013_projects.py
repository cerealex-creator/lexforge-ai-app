"""Projects (matters) with documents, stage/specificity, judicial profile; task FKs."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "013_projects"
down_revision: Union[str, None] = "012_review_context"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

project_kind = postgresql.ENUM("contract", "litigation", "consulting", name="project_kind", create_type=False)
project_status = postgresql.ENUM("active", "archived", name="project_status", create_type=False)
project_doc_role = postgresql.ENUM(
    "ours", "theirs", "joint", "evidence", "other", name="project_document_role", create_type=False
)
project_stage = postgresql.ENUM(
    "preliminary",
    "first_deal",
    "repeat",
    "addendum",
    "renewal",
    "dispute",
    "other",
    name="project_stage",
    create_type=False,
)


def upgrade() -> None:
    project_kind.create(op.get_bind(), checkfirst=True)
    project_status.create(op.get_bind(), checkfirst=True)
    project_doc_role.create(op.get_bind(), checkfirst=True)
    project_stage.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("kind", project_kind, nullable=False, server_default="contract"),
        sa.Column("status", project_status, nullable=False, server_default="active"),
        sa.Column("counterparty_name", sa.String(512), nullable=True),
        sa.Column("counterparty_inn", sa.String(12), nullable=True),
        sa.Column("industry", sa.String(32), nullable=True),
        sa.Column("our_position", sa.String(32), nullable=True),
        sa.Column("stage", project_stage, nullable=True),
        sa.Column("specificity", sa.Text(), nullable=True),
        sa.Column("brief", sa.Text(), nullable=True),
        sa.Column("judicial_profile", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("memory_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_projects_company_id", "projects", ["company_id"])

    op.create_table(
        "project_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", project_doc_role, nullable=False, server_default="ours"),
        sa.Column("edition", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "document_id", name="uq_project_documents_project_document"),
    )
    op.create_index("ix_project_documents_project_id", "project_documents", ["project_id"])

    op.add_column(
        "document_tasks",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "comparison_tasks",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "legal_work_items",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "counterparty_checks",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_document_tasks_project_id", "document_tasks", ["project_id"])
    op.create_index("ix_comparison_tasks_project_id", "comparison_tasks", ["project_id"])
    op.create_index("ix_legal_work_items_project_id", "legal_work_items", ["project_id"])
    op.create_index("ix_counterparty_checks_project_id", "counterparty_checks", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_counterparty_checks_project_id", table_name="counterparty_checks")
    op.drop_index("ix_legal_work_items_project_id", table_name="legal_work_items")
    op.drop_index("ix_comparison_tasks_project_id", table_name="comparison_tasks")
    op.drop_index("ix_document_tasks_project_id", table_name="document_tasks")
    op.drop_column("counterparty_checks", "project_id")
    op.drop_column("legal_work_items", "project_id")
    op.drop_column("comparison_tasks", "project_id")
    op.drop_column("document_tasks", "project_id")

    op.drop_index("ix_project_documents_project_id", table_name="project_documents")
    op.drop_table("project_documents")
    op.drop_index("ix_projects_company_id", table_name="projects")
    op.drop_table("projects")

    project_stage.drop(op.get_bind(), checkfirst=True)
    project_doc_role.drop(op.get_bind(), checkfirst=True)
    project_status.drop(op.get_bind(), checkfirst=True)
    project_kind.drop(op.get_bind(), checkfirst=True)
