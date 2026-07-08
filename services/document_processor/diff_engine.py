"""Paragraph-level diff between two contract texts.

Only the *changed* paragraphs are sent to the LLM (not the full text of both
documents) — this keeps token usage manageable for long contracts where only
a few clauses were edited, which is the typical "redline from counterparty"
scenario.
"""

import difflib
from dataclasses import dataclass


@dataclass
class DiffChunk:
    change_type: str  # "replace" | "delete" | "insert"
    base_text: str
    revised_text: str


def _split_paragraphs(text: str) -> list[str]:
    paragraphs = [p.strip() for p in text.replace("\r\n", "\n").split("\n\n")]
    return [p for p in paragraphs if p]


def compute_diff(base_text: str, revised_text: str) -> list[DiffChunk]:
    base_paras = _split_paragraphs(base_text)
    revised_paras = _split_paragraphs(revised_text)

    matcher = difflib.SequenceMatcher(None, base_paras, revised_paras, autojunk=False)
    chunks: list[DiffChunk] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        chunks.append(
            DiffChunk(
                change_type=tag,
                base_text="\n\n".join(base_paras[i1:i2]),
                revised_text="\n\n".join(revised_paras[j1:j2]),
            )
        )
    return chunks


def render_diff_for_prompt(chunks: list[DiffChunk], max_chars: int = 30_000) -> tuple[str, bool]:
    """Render diff chunks as a compact БЫЛО/СТАЛО block for the LLM prompt."""
    parts: list[str] = []
    total = 0
    truncated = False

    for i, chunk in enumerate(chunks, start=1):
        block_lines = [f"[Изменение {i}]"]
        if chunk.base_text:
            block_lines.append(f"БЫЛО:\n{chunk.base_text}")
        if chunk.revised_text:
            block_lines.append(f"СТАЛО:\n{chunk.revised_text}")
        block = "\n".join(block_lines) + "\n\n"

        if total + len(block) > max_chars:
            truncated = True
            break
        parts.append(block)
        total += len(block)

    return "".join(parts), truncated
