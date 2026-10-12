from __future__ import annotations

from ..models import FactPack, Outline, Strategy, Usage
from .base import AgentContext, run_structured

NODE_KEY = "outliner"
LABEL = "Structure the article"

DEFAULT_PROMPT = """You are an editor who designs article structure for readers who skim. Design the structure so that a reader who only reads the first two lines, the headings, and the bold lines still gets the answer, and a reader who reads everything is rewarded with the reasoning.

Structure rules:
1. answer_first_summary: two or three sentences that directly answer the reader question. No preamble, no "in this article".
2. Four to seven sections. Each heading is specific, and at least two headings are phrased as the question a reader (or an AI assistant) would ask.
3. Every section has one key_takeaway: a single bold-able sentence the reader can act on.
4. Assign fact ids to each section. A section with no facts must be cut or merged. Do not leave a fact pack fact unused if it supports the thesis.
5. format_hint: use bullets, steps, a table or a comparison wherever the content is list-shaped. Prose only where the argument needs it.
6. faq_questions: three to five questions worth answering briefly at the end, drawn from the strategist's GEO questions and the reader's likely follow-ups.
7. mid_cta_after_section: the section after which a short, contextual invitation to talk to the business fits naturally (usually after the section that shows the business's own work)."""


def _facts_text(pack: FactPack) -> str:
    return "\n".join(f"- {f.id} [{f.kind}, {f.confidence}] {f.statement}" for f in pack.facts)


def run(ctx: AgentContext, strategy: Strategy, pack: FactPack) -> tuple[Outline, Usage]:
    user = f"""{ctx.brief()}

Strategy:
- Working title: {strategy.working_title}
- Reader question: {strategy.reader_question}
- Thesis: {strategy.thesis}
- Format: {strategy.content_format}
- Primary keyword: {strategy.primary_keyword}
- Questions to answer directly: {"; ".join(strategy.geo_questions)}
- Target length: about {ctx.setup.word_target()} words.

Fact pack:
{_facts_text(pack)}

Do not claim: {"; ".join(pack.do_not_claim) or "(nothing listed)"}

Design the structure. Return the Outline JSON."""
    return run_structured(ctx, node_key=NODE_KEY, default_prompt=DEFAULT_PROMPT, user=user, output=Outline, strong=False)
