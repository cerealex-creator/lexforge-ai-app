"""Export legal work item markdown results to DOCX."""

from io import BytesIO

from services.document_processor.docx_from_markdown import markdown_to_docx_bytes


def export_markdown_docx(markdown: str, *, fallback_title: str = "document") -> bytes:
    md = (markdown or "").strip()
    if not md:
        md = f"# {fallback_title}\n\n(пустой результат)"
    return markdown_to_docx_bytes(md)
