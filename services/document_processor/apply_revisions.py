"""Apply approved review findings into a source .docx body (new edition)."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

from docx import Document as DocxDocument
from docx.shared import Pt

from services.ai_orchestrator.review_findings import normalize_revision_action
from services.document_processor.annotated_export import (
    _add_plain_heading,
    _find_paragraph,
)


def _set_paragraph_text(paragraph, text: str) -> None:
    """Replace paragraph text, keeping formatting of the first run when possible."""
    text = text or ""
    runs = paragraph.runs
    if runs:
        runs[0].text = text
        for run in runs[1:]:
            run.text = ""
        return
    paragraph.add_run(text)


def _apply_to_paragraph(paragraph, finding: dict) -> None:
    suggested = (finding.get("suggested_revision") or "").strip()
    if not suggested:
        return
    action = normalize_revision_action(finding)
    if action == "supplement":
        existing = (paragraph.text or "").rstrip()
        joined = f"{existing} {suggested}".strip() if existing else suggested
        _set_paragraph_text(paragraph, joined)
    else:
        _set_paragraph_text(paragraph, suggested)


def apply_revisions_to_docx(
    source: Path | str | bytes,
    findings: list[dict],
) -> tuple[bytes, dict]:
    """Return revised .docx bytes and stats: {applied, unmatched, skipped}.

    - restate: replace matched paragraph with suggested_revision
    - supplement: append suggested_revision to matched paragraph
    Unmatched findings go to an appendix at the end of the document.
    """
    if isinstance(source, (bytes, bytearray)):
        doc = DocxDocument(BytesIO(source))
    else:
        doc = DocxDocument(str(source))

    used: set[int] = set()
    applied: list[dict] = []
    unmatched: list[dict] = []
    skipped = 0

    for finding in findings:
        if not isinstance(finding, dict):
            skipped += 1
            continue
        suggested = (finding.get("suggested_revision") or "").strip()
        if not suggested:
            skipped += 1
            continue

        quote = (finding.get("original_text") or "").strip()
        para = _find_paragraph(doc, quote, used) if quote else None
        if para is None:
            clause = (finding.get("clause_ref") or "").strip()
            if clause and len(clause) >= 3:
                para = _find_paragraph(doc, clause, used)
        if para is None:
            unmatched.append(finding)
            continue

        _apply_to_paragraph(para, finding)
        applied.append(finding)

    if unmatched:
        doc.add_page_break()
        _add_plain_heading(doc, "Правки без привязки к тексту")
        doc.add_paragraph(
            "Ниже — правки, которые не удалось однозначно вставить в исходный документ. "
            "Внесите их вручную или уточните цитату в проверке."
        )
        for i, f in enumerate(unmatched, start=1):
            clause = (f.get("clause_ref") or f"п. {i}").strip()
            action = normalize_revision_action(f)
            label = "Дополнить" if action == "supplement" else "Изложить в редакции"
            text = (f.get("suggested_revision") or "").strip()
            p = doc.add_paragraph()
            run = p.add_run(f"{i}. {clause} — {label}: ")
            run.bold = True
            p.add_run(text)
            orig = (f.get("original_text") or "").strip()
            if orig:
                note = doc.add_paragraph()
                r = note.add_run(f"Исходная цитата: «{orig[:400]}»")
                r.italic = True
                r.font.size = Pt(9)

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue(), {
        "applied": len(applied),
        "unmatched": len(unmatched),
        "skipped": skipped,
    }
