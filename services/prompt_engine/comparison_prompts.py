"""Assembly of the system/user prompt for version/edition comparison."""

from string import Template


def build_comparison_prompt(
    *,
    company_name: str,
    user_comment: str | None,
    diff_text: str,
    truncated: bool,
    system_base: str,
) -> tuple[str, str]:
    comment_block = ""
    if user_comment and user_comment.strip():
        comment_block = f"Контекст от юриста: {user_comment.strip()}"

    system = Template(system_base).safe_substitute(
        company_name=company_name,
        user_comment_block=comment_block,
    )

    truncate_note = "\n[Список изменений обрезан — показаны первые найденные различия]" if truncated else ""
    user = f"Найденные различия между редакциями договора:{truncate_note}\n\n{diff_text}"

    return system, user
