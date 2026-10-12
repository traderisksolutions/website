from __future__ import annotations

from ..models import Draft, FactPack, Outline, Strategy, Usage
from .base import AgentContext, run_structured

NODE_KEY = "writer"
LABEL = "Write the draft"

DEFAULT_PROMPT = """You are a writer producing a complete article in Markdown from an outline and a fact pack. The article must read as one connected argument written by someone who has done this work, not as a list of generic sections.

Writing rules:
1. Open with the answer: the first paragraph directly answers the reader question in two or three sentences. No preamble.
2. Use the outline's headings as H2 (##). Start every section with its key takeaway in bold, then explain.
3. Paragraphs of 60 words or fewer. Use bullets, numbered steps or a Markdown table wherever the outline's format hint says so.
4. Fact markers: every sentence that states something specific about the business, a number, a name, a price, a timeframe, a result, a regulation or a named tool ends with the supporting fact id in square brackets, like [F3] or [F3][F7]. A specific claim without a marker is not allowed. Do not invent fact ids.
5. Use the facts' own numbers and wording. Do not round up, extrapolate or combine facts into a bigger claim than any single fact supports.
6. Do not write calls to action, contact details or an FAQ. They are added later.
7. No banned words (best, leading, premier, number one, world-class, guarantee, cutting-edge, revolutionary, game-changing). No em dashes. No filler openers such as "In today's fast-paced world".
8. Write in the briefed language and spelling, use the market's currency, and speak to the briefed reader.
9. Title: write it last, and make it a promise the body actually delivers."""

REVISION_PROMPT = """You are revising an article after a fact check. Apply every revision instruction exactly: remove the sentence, soften it to what the cited fact supports, or attach the correct fact id. Keep everything else unchanged, including all existing fact markers, headings and formatting. Do not add any new specific claim. Return the full corrected Markdown."""


def _facts_text(pack: FactPack) -> str:
    lines = []
    for f in pack.facts:
        src = f" (from {f.knowledge_id})" if f.knowledge_id else ""
        lines.append(f"- {f.id} [{f.kind}, {f.confidence}]{src}: {f.statement}\n  Quote: \"{f.quote}\"")
    return "\n".join(lines)


def _outline_text(outline: Outline) -> str:
    out = [f"Answer-first summary: {outline.answer_first_summary}"]
    for i, s in enumerate(outline.sections, start=1):
        out.append(f"{i}. ## {s.heading}\n   Purpose: {s.purpose}\n   Key takeaway: {s.key_takeaway}\n   Facts: {', '.join(s.fact_ids) or '(none)'}\n   Format: {s.format_hint}")
    return "\n".join(out)


def run(ctx: AgentContext, strategy: Strategy, pack: FactPack, outline: Outline) -> tuple[Draft, Usage]:
    user = f"""{ctx.brief()}

Thesis: {strategy.thesis}
Primary keyword (use naturally in the first 100 words and in one heading): {strategy.primary_keyword}
Secondary keywords: {", ".join(strategy.secondary_keywords)}
Target length: about {ctx.setup.word_target()} words (not less than {int(ctx.setup.word_target() * 0.8)}).

Outline:
{_outline_text(outline)}

Fact pack (the only specific claims you may make):
{_facts_text(pack)}

Do not claim: {"; ".join(pack.do_not_claim) or "(nothing listed)"}

Write the article. Return the Draft JSON with the full Markdown in `markdown`."""
    return run_structured(ctx, node_key=NODE_KEY, default_prompt=DEFAULT_PROMPT, user=user, output=Draft, strong=True, max_tokens=20000)


def revise(ctx: AgentContext, draft: Draft, pack: FactPack, instructions: list[str]) -> tuple[Draft, Usage]:
    user = f"""{ctx.brief()}

Revision instructions from the fact checker:
{chr(10).join(f"- {i}" for i in instructions)}

Fact pack (the only specific claims allowed):
{_facts_text(pack)}

Current article (Markdown):
{draft.markdown}

Apply the instructions and return the Draft JSON with the full corrected Markdown. Keep the title unless an instruction changes it."""
    return run_structured(ctx, node_key="writer_revise", default_prompt=REVISION_PROMPT, user=user, output=Draft, strong=True, max_tokens=20000)
