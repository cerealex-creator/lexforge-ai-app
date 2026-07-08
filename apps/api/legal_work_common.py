"""Shared helpers for legal work item routers."""


import uuid
from urllib.parse import quote

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from io import BytesIO
from sqlalchemy.ext.asyncio import AsyncSession

from packages.db.models import LegalWorkItem, LegalWorkKind
from services.document_processor.legal_work_export import export_markdown_docx


def decision_result_to_markdown(result: dict) -> str:
    lines = ["# Заключение по проверке проекта решения", ""]
    if result.get("summary"):
        lines += ["## Вывод", str(result["summary"]), ""]
    if result.get("verdict"):
        lines += [f"**Вердикт:** {result['verdict']}", ""]
    issues = result.get("issues") or []
    if issues:
        lines.append("## Замечания")
        for i, issue in enumerate(issues, 1):
            if not isinstance(issue, dict):
                continue
            lines.append(
                f"{i}. [{issue.get('severity', '—')}] {issue.get('clause', '—')}: {issue.get('issue', '')}"
            )
            if issue.get("suggestion"):
                lines.append(f"   - Рекомендация: {issue['suggestion']}")
        lines.append("")
    recs = result.get("recommendations") or []
    if recs:
        lines.append("## Рекомендации")
        for r in recs:
            lines.append(f"- {r}")
    return "\n".join(lines)


async def delete_legal_item(
    db: AsyncSession,
    *,
    item_id: uuid.UUID,
    company_id: uuid.UUID,
    kind: LegalWorkKind,
) -> None:
    item = await db.get(LegalWorkItem, item_id)
    if not item or item.company_id != company_id or item.kind != kind:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    await db.delete(item)
    await db.commit()


async def export_legal_item_docx(
    db: AsyncSession,
    *,
    item_id: uuid.UUID,
    company_id: uuid.UUID,
    kind: LegalWorkKind,
) -> StreamingResponse:
    item = await db.get(LegalWorkItem, item_id)
    if not item or item.company_id != company_id or item.kind != kind:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    if item.status.value != "completed":
        raise HTTPException(status_code=400, detail="Экспорт доступен только для завершённых задач")

    result = item.result_json or {}
    if kind == LegalWorkKind.decision_review:
        md = decision_result_to_markdown(result)
    else:
        md = str(result.get("markdown") or "")

    docx = export_markdown_docx(md, fallback_title=item.title)
    filename = f"{item.title}.docx" if not item.title.lower().endswith(".docx") else item.title
    encoded = quote(filename)
    return StreamingResponse(
        BytesIO(docx),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )
