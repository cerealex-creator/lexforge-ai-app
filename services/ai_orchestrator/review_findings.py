"""Finding IDs, approved vault, and refine merge helpers for contract review."""

from __future__ import annotations

import re
import uuid
from typing import Any


def _normalize_key(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def finding_content_key(f: dict) -> str:
    return f"{_normalize_key(f.get('clause_ref', ''))}|{_normalize_key(f.get('original_text', ''))[:120]}"


def ensure_finding_ids(findings: list[dict] | None, *, default_status: str = "new") -> list[dict]:
    out: list[dict] = []
    for f in findings or []:
        if not isinstance(f, dict):
            continue
        d = dict(f)
        if not d.get("id"):
            d["id"] = str(uuid.uuid4())
        if not d.get("status"):
            d["status"] = default_status
        d["revision_action"] = normalize_revision_action(d)
        out.append(d)
    return out


def normalize_revision_action(f: dict) -> str:
    """Return 'restate' | 'supplement'. Infers when the model omitted the field."""
    raw = (f.get("revision_action") or "").strip().lower().replace("-", "_")
    aliases = {
        "restate": "restate",
        "replace": "restate",
        "rewrite": "restate",
        "full": "restate",
        "изложить": "restate",
        "редакция": "restate",
        "supplement": "supplement",
        "append": "supplement",
        "add": "supplement",
        "addition": "supplement",
        "дополнить": "supplement",
        "дополнение": "supplement",
    }
    if raw in aliases:
        return aliases[raw]

    original = (f.get("original_text") or "").strip()
    suggested = (f.get("suggested_revision") or "").strip()
    if not suggested:
        return "restate"
    if not original:
        return "supplement"

    sug_lower = suggested.lower()
    if sug_lower.startswith("дополн") or "дополнить следующим" in sug_lower:
        return "supplement"

    orig_n = _normalize_key(original)
    sug_n = _normalize_key(suggested)
    if orig_n and (orig_n in sug_n or sug_n in orig_n):
        return "restate"

    # Substantial shared tokens → rewritten full clause (restate), not a pure add-on.
    orig_tokens = set(orig_n.split())
    sug_tokens = set(sug_n.split())
    if orig_tokens:
        overlap = len(orig_tokens & sug_tokens) / len(orig_tokens)
        if overlap >= 0.45:
            return "restate"

    # Low overlap / addition-only payload from the model.
    return "supplement"


def revision_proposal_phrase(clause: str, suggested: str, action: str | None = None) -> str:
    """Counterparty-facing proposal line for Word comments / previews."""
    quote = (suggested or "").strip().strip("«»\"“”")
    clause_s = (clause or "").strip() or "пункт"
    act = action if action in ("restate", "supplement") else "restate"
    if act == "supplement":
        return f"Предлагаю дополнить {clause_s} следующим текстом: «{quote}»."
    return f"Предлагаю изложить {clause_s} в следующей редакции: «{quote}»."


def _fid(f: dict) -> str:
    return str(f.get("id") or "") or finding_content_key(f)


def merge_vault(parent_vault: list[dict] | None, newly_accepted: list[dict] | None) -> list[dict]:
    """Accumulate approved findings; last write wins per id."""
    by_id: dict[str, dict] = {}
    for f in ensure_finding_ids(parent_vault or [], default_status="from_vault"):
        d = dict(f)
        d["status"] = "from_vault"
        by_id[_fid(d)] = d
    for f in ensure_finding_ids(newly_accepted or [], default_status="from_vault"):
        d = dict(f)
        d["status"] = "from_vault"
        # Drop revise markers when entering vault
        d.pop("previous_suggested_revision", None)
        d.pop("previous_rationale", None)
        d.pop("lawyer_note", None)
        by_id[_fid(d)] = d
    return list(by_id.values())


def merge_dismissed(parent: list[dict] | None, newly: list[dict] | None) -> list[dict]:
    """Accumulate dismissed findings so the LLM won't re-raise them."""
    by_id: dict[str, dict] = {}
    for f in ensure_finding_ids(parent or [], default_status="dismissed"):
        d = _compact_dismissed(f)
        by_id[_fid(d)] = d
    for f in ensure_finding_ids(newly or [], default_status="dismissed"):
        d = _compact_dismissed(f)
        by_id[_fid(d)] = d
    return list(by_id.values())


def _compact_dismissed(f: dict) -> dict:
    """Keep enough identity for blacklist matching without full rationale."""
    return {
        "id": f.get("id") or str(uuid.uuid4()),
        "clause_ref": (f.get("clause_ref") or "").strip(),
        "original_text": (f.get("original_text") or "").strip()[:500],
        "issue_type": (f.get("issue_type") or "").strip(),
        "status": "dismissed",
    }


def extract_parent_dismissed(parent_result: dict | None, parent_ctx: dict | None) -> list[dict]:
    parent_result = parent_result or {}
    parent_ctx = parent_ctx or {}
    if parent_result.get("dismissed_findings"):
        return merge_dismissed(parent_result["dismissed_findings"], None)
    if parent_ctx.get("dismissed_findings"):
        return merge_dismissed(parent_ctx["dismissed_findings"], None)
    return []


def dismissed_ids_and_keys(dismissed: list[dict] | None) -> tuple[set[str], set[str]]:
    items = ensure_finding_ids(dismissed or [], default_status="dismissed")
    ids = {_fid(f) for f in items if _fid(f) and _fid(f) != "|"}
    keys = {finding_content_key(f) for f in items if finding_content_key(f) != "|"}
    return ids, keys


def is_dismissed(f: dict, dismissed_ids: set[str], dismissed_keys: set[str]) -> bool:
    fid = _fid(f)
    if fid in dismissed_ids:
        return True
    return finding_content_key(f) in dismissed_keys


def parent_working_findings(parent_result: dict | None) -> list[dict]:
    if not parent_result:
        return []
    # Prefer explicit working findings; fall back to all findings
    raw = parent_result.get("findings") or []
    return ensure_finding_ids([f for f in raw if isinstance(f, dict)])


def extract_parent_vault(parent_result: dict | None, parent_ctx: dict | None) -> list[dict]:
    parent_result = parent_result or {}
    parent_ctx = parent_ctx or {}
    if parent_result.get("approved_vault"):
        return ensure_finding_ids(parent_result["approved_vault"], default_status="from_vault")
    if parent_ctx.get("approved_vault"):
        return ensure_finding_ids(parent_ctx["approved_vault"], default_status="from_vault")
    # Legacy: accepted_findings on parent refine only
    return ensure_finding_ids(parent_ctx.get("accepted_findings") or [], default_status="from_vault")


def _index_by_id(items: list[dict]) -> dict[str, dict]:
    return {_fid(f): f for f in items if _fid(f) and _fid(f) != "|"}


def apply_focused_revisions(
    *,
    vault: list[dict],
    feedback: list[dict],
    llm_findings: list[dict],
    deferred: list[dict],
    parent_risk_score: int | None = None,
    parent_risk_rationale: str | None = None,
    refine_scope: str = "focus_only",
    extra_new: list[dict] | None = None,
    dismissed: list[dict] | None = None,
) -> dict[str, Any]:
    """Build result after a focused (or supplement) refine pass."""
    vault = ensure_finding_ids(vault, default_status="from_vault")
    for v in vault:
        v["status"] = "from_vault"

    dismissed_list = merge_dismissed(dismissed, None)
    d_ids, d_keys = dismissed_ids_and_keys(dismissed_list)

    vault_ids = {_fid(v) for v in vault}
    feedback_by_id: dict[str, dict] = {}
    for item in feedback or []:
        f = item.get("finding") if isinstance(item, dict) else None
        note = (item.get("note") or "").strip() if isinstance(item, dict) else ""
        if not isinstance(f, dict):
            continue
        f = dict(f)
        if not f.get("id"):
            f["id"] = str(uuid.uuid4())
        if is_dismissed(f, d_ids, d_keys):
            continue
        feedback_by_id[_fid(f)] = {"finding": f, "note": note}

    llm_by_id = _index_by_id(ensure_finding_ids(llm_findings, default_status="revised"))

    revised: list[dict] = []
    for fid, fb in feedback_by_id.items():
        original = fb["finding"]
        note = fb["note"]
        updated = llm_by_id.get(fid)
        if not updated:
            ok = finding_content_key(original)
            updated = next(
                (x for x in llm_by_id.values() if finding_content_key(x) == ok),
                None,
            )
        if updated:
            d = dict(updated)
            d["id"] = original.get("id") or d.get("id") or str(uuid.uuid4())
            d["status"] = "revised"
            d["lawyer_note"] = note
            d["previous_suggested_revision"] = original.get("suggested_revision")
            d["previous_rationale"] = original.get("rationale")
            revised.append(d)
        else:
            d = dict(original)
            d["status"] = "revised"
            d["lawyer_note"] = note
            d["previous_suggested_revision"] = original.get("suggested_revision")
            d["previous_rationale"] = original.get("rationale")
            revised.append(d)

    revised_ids = {_fid(r) for r in revised}

    deferred_out: list[dict] = []
    for f in ensure_finding_ids(deferred, default_status="deferred"):
        fid = _fid(f)
        if fid in vault_ids or fid in revised_ids or fid == "|" or is_dismissed(f, d_ids, d_keys):
            continue
        d = dict(f)
        d["status"] = "deferred"
        deferred_out.append(d)

    new_out: list[dict] = []
    if refine_scope == "supplement" and extra_new:
        known = vault_ids | revised_ids | {_fid(x) for x in deferred_out} | d_ids
        known_keys = {finding_content_key(x) for x in vault + revised + deferred_out} | d_keys
        for f in ensure_finding_ids(extra_new, default_status="new"):
            fid = _fid(f)
            if fid in known or finding_content_key(f) in known_keys or is_dismissed(f, d_ids, d_keys):
                continue
            d = dict(f)
            d["status"] = "new"
            new_out.append(d)
            known.add(fid)

    working = revised + new_out + deferred_out

    risk_pool = vault + working
    if working:
        risk_score = _score_from_findings(risk_pool)
        risk_rationale = (
            f"Перепроверка ({refine_scope}): в копилке {len(vault)}, "
            f"исправлено по замечаниям {len(revised)}, новых {len(new_out)}, "
            f"отложено {len(deferred_out)}, отменено {len(dismissed_list)}."
        )
    else:
        risk_score = int(parent_risk_score) if parent_risk_score is not None else _score_from_findings(vault)
        risk_rationale = (parent_risk_rationale or "").strip() or (
            f"Перепроверка без новых правок; копилка: {len(vault)}."
        )

    return {
        "findings": working,
        "approved_vault": vault,
        "dismissed_findings": dismissed_list,
        "risk_score": max(1, min(10, int(risk_score))),
        "risk_rationale": risk_rationale,
        "accepted_count": len(vault),
        "revised_count": len(revised),
        "new_count": len(new_out),
        "deferred_count": len(deferred_out),
        "dismissed_count": len(dismissed_list),
        "refine_scope": refine_scope,
    }

_SEVERITY_SCORE = {"critical": 10, "high": 8, "medium": 5, "low": 3}


def _score_from_findings(findings: list[dict]) -> int:
    if not findings:
        return 2
    scores = [_SEVERITY_SCORE.get((f.get("severity") or "medium").lower(), 5) for f in findings]
    return max(1, min(10, max(scores)))


def normalize_initial_result(result: dict) -> dict:
    """Stamp ids/status on a fresh (non-refine) review result."""
    out = dict(result)
    findings = ensure_finding_ids(out.get("findings") or [], default_status="new")
    for f in findings:
        f["status"] = "new"
    out["findings"] = findings
    out["approved_vault"] = ensure_finding_ids(out.get("approved_vault") or [], default_status="from_vault")
    out["dismissed_findings"] = merge_dismissed(out.get("dismissed_findings") or [], None)
    out.setdefault("accepted_count", len(out["approved_vault"]))
    out.setdefault("revised_count", 0)
    out.setdefault("new_count", len(findings))
    out.setdefault("deferred_count", 0)
    out.setdefault("dismissed_count", len(out["dismissed_findings"]))
    return out


def findings_for_annotated_export(
    result: dict | None,
    *,
    only_approved: bool = True,
    extra: list[dict] | None = None,
) -> list[dict]:
    result = result or {}
    if only_approved:
        vault = ensure_finding_ids(result.get("approved_vault") or [], default_status="from_vault")
        # Also include any working findings explicitly marked from_vault
        if not vault:
            vault = [
                f
                for f in ensure_finding_ids(result.get("findings") or [])
                if f.get("status") == "from_vault"
            ]
        extra_ids = {_fid(f) for f in ensure_finding_ids(extra or [])}
        by_id = _index_by_id(vault)
        for f in ensure_finding_ids(extra or [], default_status="from_vault"):
            by_id[_fid(f)] = {**f, "status": "from_vault"}
        return list(by_id.values())
    # Full working + vault (deduped)
    return merge_vault(
        result.get("approved_vault") or [],
        (result.get("findings") or []) + (extra or []),
    )
