"""Merge findings from multiple contract-review agents."""

from __future__ import annotations

SEVERITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def _finding_key(f: dict) -> str:
    clause = (f.get("clause_ref") or "").strip().lower()
    text = (f.get("original_text") or "")[:120].strip().lower()
    issue = (f.get("issue_type") or "").strip().lower()
    return f"{clause}|{text}|{issue}"


def merge_review_results(agent_results: list[dict], agent_labels: list[str]) -> dict:
    """Deduplicate findings, take max severity, combine rationales."""
    merged_findings: dict[str, dict] = {}
    risk_scores: list[int] = []
    rationales: list[str] = []
    agents_meta: list[dict] = []

    for label, data in zip(agent_labels, agent_results):
        score = int(data.get("risk_score", 5))
        risk_scores.append(max(1, min(10, score)))
        if data.get("risk_rationale"):
            rationales.append(f"[{label}] {data['risk_rationale']}")
        agents_meta.append(
            {
                "agent": label,
                "risk_score": score,
                "findings_count": len(data.get("findings") or []),
            }
        )
        for f in data.get("findings") or []:
            if not isinstance(f, dict):
                continue
            key = _finding_key(f)
            existing = merged_findings.get(key)
            if not existing:
                merged_findings[key] = {**f, "sources": [label]}
                continue
            new_sev = SEVERITY_RANK.get(str(f.get("severity", "medium")), 2)
            old_sev = SEVERITY_RANK.get(str(existing.get("severity", "medium")), 2)
            if new_sev > old_sev:
                existing["severity"] = f.get("severity", existing.get("severity"))
            if f.get("suggested_revision") and not existing.get("suggested_revision"):
                existing["suggested_revision"] = f["suggested_revision"]
            if f.get("rationale"):
                existing["rationale"] = f"{existing.get('rationale', '')} · {f['rationale']}".strip(" ·")
            sources = existing.setdefault("sources", [])
            if label not in sources:
                sources.append(label)

    findings = list(merged_findings.values())
    findings.sort(
        key=lambda x: (
            -SEVERITY_RANK.get(str(x.get("severity", "medium")), 2),
            x.get("clause_ref") or "",
        )
    )

    # Weighted toward worst agent score (75th percentile approximation).
    risk_scores.sort()
    idx = min(len(risk_scores) - 1, max(0, int(len(risk_scores) * 0.75)))
    merged_score = risk_scores[idx] if risk_scores else 5

    return {
        "risk_score": merged_score,
        "risk_rationale": " ".join(rationales) if rationales else "Сводная оценка по нескольким агентам.",
        "findings": findings,
        "multi_agent": True,
        "agents": agents_meta,
    }
