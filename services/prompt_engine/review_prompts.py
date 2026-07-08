"""Assembly of the final system/user prompt sent to the LLM for contract review.

The actual prompt text (system base template, per-mode instructions, per-industry
labels) is editable via Prompt Management UI — see `registry.py` for defaults and
`prompt_service.py` for DB override resolution. This module only does template
substitution and contract text truncation.
"""

from string import Template


def build_review_prompt(
    *,
    mode: str,
    industry: str,
    contract_text: str,
    user_comment: str | None,
    company_name: str,
    system_base: str,
    mode_instruction: str,
    industry_label: str,
    reference_text: str | None = None,
    reference_instruction: str | None = None,
) -> tuple[str, str]:
    max_chars = 40_000
    truncated = len(contract_text) > max_chars
    text = contract_text[:max_chars] if truncated else contract_text
    truncate_note = "\n[Документ обрезан — проанализированы первые ~40 000 символов]" if truncated else ""

    system = Template(system_base).safe_substitute(
        industry_label=industry_label,
        company_name=company_name,
        mode_instruction=mode_instruction,
    )

    user_parts = [f"Договор для проверки:{truncate_note}\n\n{text}"]

    if user_comment and user_comment.strip():
        user_parts.insert(
            0,
            f"ПРИОРИТЕТНЫЙ КОНТЕКСТ ОТ ЮРИСТА:\n{user_comment.strip()}\n\n---\n",
        )

    if reference_text and reference_text.strip():
        ref_max = 20_000
        ref_truncated = len(reference_text) > ref_max
        ref_text = reference_text[:ref_max]
        ref_note = "\n[Эталонный документ обрезан]" if ref_truncated else ""
        instruction = (reference_instruction or "").strip()
        user_parts.insert(
            0,
            f"{instruction}\n\nЭТАЛОННЫЙ ДОКУМЕНТ КОМПАНИИ:{ref_note}\n\n{ref_text}\n\n---\n",
        )

    return system, "\n".join(user_parts)
