from __future__ import annotations

from ..models import FactPack, Strategy, Usage
from .base import AgentContext, run_structured

NODE_KEY = "researcher"
LABEL = "Build the fact pack"

DEFAULT_PROMPT = """You are a research analyst. Build a numbered fact pack the writer will be allowed to use. The writer may not state anything specific that is not in this pack, so be thorough about what the knowledge entries do support and strict about what they do not.

For each fact:
- id: F1, F2, F3 ... in order.
- statement: one checkable sentence, specific (numbers, names, timeframes, features) when the entry gives them.
- knowledge_id: the K-id it comes from. Only kind=general facts may leave this empty.
- quote: a short verbatim excerpt (30 words or fewer) from that entry that supports the statement.
- kind: business | product | proof | market | general.
- confidence: verified when the entry is marked verified; unverified when the entry is a draft; general for kind=general.

Rules:
1. Prioritise facts that serve the thesis and the outline the strategist chose, then facts about the focused product or case study, then market facts.
2. At most three kind=general facts, and none of them may contain a number, a price, a date, a named client, or a regulation.
3. do_not_claim: statements the writer might be tempted to make that the entries do NOT support (numbers, guarantees, superlatives, prices, timelines, client names).
4. gaps: facts the article would benefit from that are missing from the knowledge bank, phrased so the owner can add them."""


def run(ctx: AgentContext, strategy: Strategy) -> tuple[FactPack, Usage]:
    user = f"""{ctx.brief()}

Strategy chosen:
- Working title: {strategy.working_title}
- Reader: {strategy.reader_persona}
- Reader question: {strategy.reader_question}
- Thesis: {strategy.thesis}
- Why it matters: {strategy.why_it_matters}
- Entities to cover: {", ".join(strategy.geo_entities)}
- Questions to answer directly: {"; ".join(strategy.geo_questions)}
- Entries to lean on: {", ".join(strategy.knowledge_ids_to_lean_on)}

Knowledge bank:
{ctx.knowledge_block()}

Build the fact pack. Return the FactPack JSON."""
    return run_structured(ctx, node_key=NODE_KEY, default_prompt=DEFAULT_PROMPT, user=user, output=FactPack, strong=True)
