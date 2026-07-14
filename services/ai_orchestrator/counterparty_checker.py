from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.db.models import CounterpartyCheck, Project, TaskStatus
from services.ai_orchestrator.llm_client import chat_json
from services.prompt_engine.due_diligence_guide import (
    default_sources,
    format_resources_block,
)
from services.prompt_engine.project_context import format_project_context
from services.prompt_engine.prompt_service import get_prompt_map


def _normalize_inn(inn: str) -> str:
    return re.sub(r"\D+", "", (inn or "").strip())


def _validate_inn(inn: str) -> str | None:
    inn = _normalize_inn(inn)
    if len(inn) not in (10, 12):
        return "ИНН должен быть 10 или 12 цифр"
    if not inn.isdigit():
        return "ИНН должен содержать только цифры"
    return None


def _judicial_profile_from_result(result: dict, inn: str) -> dict:
    """Map LLM due diligence output into project.judicial_profile (manual-ready)."""
    checks = result.get("checks") or result.get("manual_checks") or []
    links = result.get("links") or result.get("sources") or []
    risks = result.get("risks") or result.get("risk_flags") or result.get("red_flags") or []
    if isinstance(risks, list):
        flags = [r if isinstance(r, str) else (r.get("title") or r.get("text") or str(r)) for r in risks]
    else:
        flags = []

    kad_bits = []
    media_bits = []
    for c in checks:
        if not isinstance(c, dict):
            continue
        src = (c.get("source") or "").lower()
        detail_parts = [
            p
            for p in (
                c.get("what_to_check") or c.get("note"),
                c.get("how_to_check"),
            )
            if p
        ]
        detail = " — ".join(str(p) for p in detail_parts) if detail_parts else str(c)
        if "арбитр" in src or "kad" in src or "суд" in src or "fedresurs" in src or "федресурс" in src:
            kad_bits.append(detail)
        if "сми" in src or "media" in src or "санкц" in src or "поиск" in src:
            media_bits.append(detail)

    sources = []
    for link in links:
        if isinstance(link, dict):
            sources.append({"title": link.get("title") or "", "url": link.get("url") or ""})
        elif isinstance(link, str):
            sources.append({"title": link, "url": link})
    for c in checks:
        if isinstance(c, dict) and c.get("url"):
            sources.append({"title": c.get("source") or c.get("url"), "url": c["url"]})

    # Dedupe sources by url
    seen_urls: set[str] = set()
    deduped: list[dict[str, str]] = []
    for s in sources:
        u = (s.get("url") or "").strip()
        if not u or u in seen_urls:
            continue
        seen_urls.add(u)
        deduped.append(s)
    sources = deduped

    verdict = result.get("verdict") or result.get("recommendation") or ""
    summary = result.get("summary") or result.get("risk_rationale") or ""
    technique = result.get("search_technique") or ""
    if verdict:
        summary = f"{verdict}. {summary}".strip()
    if technique:
        summary = f"{summary} Техника: {technique}".strip()

    return {
        "summary": (summary[:2000] if summary else f"Due diligence по ИНН {inn} (самостоятельный чеклист)"),
        "kad_notes": (
            "; ".join(kad_bits)[:2000]
            if kad_bits
            else (
                "КАД Арбитр (kad.arbitr.ru): поиск по ИНН за 3–5 лет — частота споров, роль ответчика, "
                "банкротные дела, суммы. Федресурс (fedresurs.ru) — сообщения о банкротстве."
            )
        ),
        "media_notes": (
            "; ".join(media_bits)[:2000]
            if media_bits
            else (
                "Открытый поиск: «ИНН + банкротство», «название + мошенничество/санкции». "
                "Зафиксируйте ссылки на источники. Live-парсинг СМИ не подключён."
            )
        ),
        "risk_flags": flags[:20],
        "sources": (sources[:16] or default_sources())[:16],
        "manual_checks": [
            {
                "source": c.get("source") or "",
                "url": c.get("url") or "",
                "what_to_check": c.get("what_to_check") or "",
                "how_to_check": c.get("how_to_check") or "",
            }
            for c in checks
            if isinstance(c, dict)
        ][:20],
        "last_checked_at": datetime.now(timezone.utc).isoformat(),
        "source": "counterparty_check",
        "inn": inn,
    }


async def run_counterparty_check(check_id: uuid.UUID) -> None:
    from apps.api.database import async_session

    async with async_session() as db:
        check = await db.get(CounterpartyCheck, check_id)
        if not check:
            return

        check.status = TaskStatus.processing
        await db.commit()

        try:
            err = _validate_inn(check.inn)
            if err:
                raise ValueError(err)

            prompts = await get_prompt_map(db, ["counterparty_check.system_base"])
            system = prompts["counterparty_check.system_base"]

            context = (check.result_json or {}).get("context") or "—"
            project_block = ""
            if check.project_id:
                project = await db.get(Project, check.project_id)
                if project:
                    project_block = format_project_context(project)
                    if not project.counterparty_inn:
                        project.counterparty_inn = check.inn

            user_parts = [
                "Сделай юридический due diligence по ИНН.\n",
                f"ИНН: {check.inn}\n",
                f"Контекст: {context}\n",
                "\n",
                format_resources_block(),
                "\n\nОсобое внимание — судебная нагрузка (КАД) и платёжеспособность (ФССП/Федресурс). "
                "В каждом manual_checks укажи url и how_to_check — конкретную технику поиска.\n",
            ]
            if project_block:
                user_parts.insert(0, project_block + "\n\n---\n")

            result = await chat_json(system, "\n".join(user_parts))
            # Preserve original context key
            if isinstance(result, dict):
                result = {**result, "context": context if context != "—" else result.get("context")}

            check.result_json = result
            check.status = TaskStatus.completed
            check.error_message = None
            check.completed_at = datetime.now(timezone.utc)

            if check.project_id:
                project = await db.get(Project, check.project_id)
                if project:
                    project.judicial_profile = _judicial_profile_from_result(result or {}, check.inn)
                    if not project.counterparty_inn:
                        project.counterparty_inn = check.inn
                    project.updated_at = datetime.now(timezone.utc)

            await db.commit()

        except Exception as e:
            check.status = TaskStatus.failed
            check.error_message = str(e)[:2000]
            check.completed_at = datetime.now(timezone.utc)
            await db.commit()
