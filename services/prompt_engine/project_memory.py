"""Project AI memory: open risks, accepted findings, concessions — updated after tasks."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from packages.db.models import Project


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_memory(project: Project) -> dict[str, Any]:
    mem = dict(project.memory_json or {})
    mem.setdefault("open_risks", [])
    mem.setdefault("accepted_positions", [])
    mem.setdefault("concessions", [])
    mem.setdefault("closed_issues", [])
    mem.setdefault("notes", [])
    mem.setdefault("updated_at", None)
    return mem


def _clip(text: str, n: int = 240) -> str:
    t = (text or "").strip()
    return t if len(t) <= n else t[: n - 1] + "…"


def _dedupe_key(item: dict) -> str:
    return "|".join(
        [
            (item.get("clause_ref") or "").strip().lower(),
            _clip(item.get("summary") or item.get("original_text") or "", 80).lower(),
        ]
    )


def merge_unique(existing: list[dict], incoming: list[dict], *, limit: int = 40) -> list[dict]:
    seen = {_dedupe_key(x) for x in existing}
    out = list(existing)
    for item in incoming:
        key = _dedupe_key(item)
        if not key or key == "|" or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out[-limit:]


def update_memory_from_review(
    project: Project,
    *,
    findings: list[dict],
    accepted_findings: list[dict] | None = None,
    risk_score: int | None = None,
    task_id: str | None = None,
) -> dict[str, Any]:
    """Refresh open risks from latest review; keep accepted positions from refine."""
    mem = _ensure_memory(project)

    open_risks = []
    for f in findings:
        if not isinstance(f, dict):
            continue
        open_risks.append(
            {
                "clause_ref": f.get("clause_ref") or "",
                "severity": f.get("severity") or "medium",
                "summary": _clip(f.get("rationale") or f.get("original_text") or "", 280),
                "original_text": _clip(f.get("original_text") or "", 160),
                "source": "review",
                "task_id": task_id,
                "at": _now(),
            }
        )
    # Replace open risks with latest snapshot (project bubble should reflect current edition)
    mem["open_risks"] = open_risks[:40]

    if accepted_findings:
        accepted = []
        for f in accepted_findings:
            if not isinstance(f, dict):
                continue
            accepted.append(
                {
                    "clause_ref": f.get("clause_ref") or "",
                    "severity": f.get("severity") or "medium",
                    "summary": _clip(f.get("rationale") or "", 280),
                    "source": "accepted_review",
                    "task_id": task_id,
                    "at": _now(),
                }
            )
        mem["accepted_positions"] = merge_unique(mem.get("accepted_positions") or [], accepted)

    if risk_score is not None:
        mem["last_risk_score"] = risk_score
    mem["last_review_task_id"] = task_id
    mem["updated_at"] = _now()
    project.memory_json = mem
    return mem


def update_memory_from_comparison(
    project: Project,
    *,
    changes: list[dict],
    summary: str | None = None,
    risk_delta: int | None = None,
    task_id: str | None = None,
) -> dict[str, Any]:
    """Extract concessions / unfavorable moves from comparison result."""
    mem = _ensure_memory(project)
    concessions: list[dict] = []
    closed: list[dict] = []

    for c in changes:
        if not isinstance(c, dict):
            continue
        impact = (c.get("impact") or "").lower()
        clause = c.get("clause_ref") or ""
        rationale = _clip(c.get("rationale") or "", 280)
        item = {
            "clause_ref": clause,
            "impact": impact,
            "severity": c.get("severity") or "medium",
            "summary": rationale or _clip(c.get("revised_text") or c.get("original_text") or "", 200),
            "original_text": _clip(c.get("original_text") or "", 120),
            "revised_text": _clip(c.get("revised_text") or "", 120),
            "source": "comparison",
            "task_id": task_id,
            "at": _now(),
        }
        if impact in ("unfavorable", "suspicious"):
            concessions.append(item)
        elif impact == "favorable":
            closed.append(item)

    mem["concessions"] = merge_unique(mem.get("concessions") or [], concessions, limit=30)
    mem["closed_issues"] = merge_unique(mem.get("closed_issues") or [], closed, limit=30)
    if summary:
        note = {"text": _clip(summary, 500), "source": "comparison", "task_id": task_id, "at": _now()}
        notes = list(mem.get("notes") or [])
        notes.append(note)
        mem["notes"] = notes[-15:]
    if risk_delta is not None:
        mem["last_risk_delta"] = risk_delta
    mem["last_comparison_task_id"] = task_id
    mem["updated_at"] = _now()
    project.memory_json = mem
    return mem


def format_memory_block(memory: dict | None) -> str:
    if not memory:
        return ""
    lines: list[str] = ["ПАМЯТЬ ПРОЕКТА (накопленный контекст — не начинай с нуля):"]

    accepted = memory.get("accepted_positions") or []
    if accepted:
        lines.append("Уже принятые/одобренные позиции (не поднимай как новые риски без причины):")
        for i, a in enumerate(accepted[:12], 1):
            lines.append(
                f"  {i}. [{a.get('severity')}] {a.get('clause_ref') or '—'}: {a.get('summary') or ''}"
            )

    concessions = memory.get("concessions") or []
    if concessions:
        lines.append(
            "Зафиксированные уступки / ухудшения для нас (учитывай при оценке новых редакций; "
            "не кричи о них как о «вдруг найденных», если это уже сознательная уступка):"
        )
        for i, c in enumerate(concessions[:12], 1):
            lines.append(
                f"  {i}. [{c.get('impact')}/{c.get('severity')}] {c.get('clause_ref') or '—'}: {c.get('summary') or ''}"
            )

    open_risks = memory.get("open_risks") or []
    if open_risks:
        lines.append("Открытые риски по последней проверке:")
        for i, r in enumerate(open_risks[:15], 1):
            lines.append(
                f"  {i}. [{r.get('severity')}] {r.get('clause_ref') or '—'}: {r.get('summary') or ''}"
            )

    closed = memory.get("closed_issues") or []
    if closed:
        lines.append("Позиции, которые улучшились/закрылись в нашу пользу:")
        for i, c in enumerate(closed[:8], 1):
            lines.append(f"  {i}. {c.get('clause_ref') or '—'}: {c.get('summary') or ''}")

    notes = memory.get("notes") or []
    if notes:
        last = notes[-3:]
        lines.append("Краткие итоги прошлых сравнений:")
        for n in last:
            lines.append(f"  - {n.get('text') or ''}")

    if memory.get("last_risk_score") is not None:
        lines.append(f"Последняя оценка риска договора: {memory['last_risk_score']}/10")
    if memory.get("last_risk_delta") is not None:
        lines.append(f"Последнее изменение риска при сравнении: {memory['last_risk_delta']:+d}")

    if len(lines) <= 1:
        return ""
    return "\n".join(lines)
