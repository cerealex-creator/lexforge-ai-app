"""Adjust document_chunks.embedding dimension to 1024 for bge-m3."""

from typing import Sequence, Union

from alembic import op

# Keep revision id <= 32 chars (alembic_version.version_num is VARCHAR(32))
revision: str = "008_doc_chunks_vec1024"
down_revision: Union[str, None] = "007_counterparty_checks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # If there are existing vectors with a different dimension, safest is to null them out.
    op.execute("UPDATE document_chunks SET embedding = NULL WHERE embedding IS NOT NULL;")
    op.execute("ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(1024);")


def downgrade() -> None:
    op.execute("UPDATE document_chunks SET embedding = NULL WHERE embedding IS NOT NULL;")
    op.execute("ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(1536);")

