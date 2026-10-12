from __future__ import annotations

from ..models import Draft, FactCheckReport, FactPack, Usage
from .base import AgentContext, run_structured

NODE_KEY = "fact_checker"
LABEL = "Check every claim"

DEFAULT_PROMPT = """You are a strict fact checker. Your job is to make sure the article never says anything specific that the fact pack does not support. Assume the writer made mistakes and find them.

Procedure:
1. Extract every checkable claim: anything specific about the business, its products, results, clients, prices, timelines, features, the market, regulations, or numbers of any kind. One claim per sentence at most; include the section heading it sits under.
2. For each claim, read the fact ids cited in that sentence and decide:
   - supported: the cited fact(s) genuinely support the claim as written, with no exaggeration.
   - needs_verification: supported only by facts whose confidence is unverified.
   - unsupported: no marker, a marker that does not exist, or the cited fact does not support what the sentence says (including rounding up, combining facts, or adding detail).
   - contradicted: the facts say otherwise.
   - general_knowledge: uncontroversial, contains no number, price, name, client, date or regulation, and does not describe the business.
3. revision_instructions: one instruction per unsupported or contradicted claim, quoting the sentence and saying exactly what to do: remove it, soften it to what fact Fx supports, or attach fact Fx.
4. verdict: pass if there are zero unsupported and zero contradicted claims; revise if there are eight or fewer; fail if more."""


def _facts_text(pack: FactPack) -> str:
    return "\n".join(f"- {f.id} [{f.kind}, {f.confidence}]: {f.statement} | quote: \"{f.quote}\"" for f in pack.facts)


def run(ctx: AgentContext, draft: Draft, pack: FactPack) -> tuple[FactCheckReport, Usage]:
    user = f"""{ctx.brief()}

Fact pack (the only allowed specific claims):
{_facts_text(pack)}

Do not claim: {"; ".join(pack.do_not_claim) or "(nothing listed)"}

Article to check (Markdown):
# {draft.title}

{draft.markdown}

Check every claim. Return the FactCheckReport JSON."""
    return run_structured(ctx, node_key=NODE_KEY, default_prompt=DEFAULT_PROMPT, user=user, output=FactCheckReport, strong=True, max_tokens=20000)
