from __future__ import annotations

from ..models import CtaPlan, FactPack, Strategy, Usage
from .base import AgentContext, run_structured

NODE_KEY = "cta_composer"
LABEL = "Write the calls to action"

DEFAULT_PROMPT = """You write the two calls to action for an article whose purpose is to bring in customers for a custom service. A good call to action tells the reader exactly what happens if they get in touch, in the business's own terms, and gives them one clear next step. It never hypes.

Deliver:
1. mid: a short, contextual invitation placed inside the article (heading of 6 words or fewer, text of 40 words or fewer, a button label of 4 words or fewer). It should connect to the section it follows: the business's own work or process.
2. end: the closing call to action (heading of 8 words or fewer, text of 70 words or fewer, button label of 4 words or fewer). Say who it is for, what the first step is (only as the knowledge entries describe it), and what the reader can expect.
3. why_contact_line: one sentence a reader would find credible, grounded in a fact from the pack (cite it like [F4]).

Rules: only describe the process, offers and outcomes the fact pack supports; no prices unless a fact states them; no banned words; write in the article language."""


def run(ctx: AgentContext, strategy: Strategy, pack: FactPack) -> tuple[CtaPlan, Usage]:
    process_facts = [f for f in pack.facts if f.kind in ("business", "product", "proof")]
    user = f"""{ctx.brief()}

Thesis of the article: {strategy.thesis}
Reader: {strategy.reader_persona}

Facts about the business, its process and results:
{chr(10).join(f"- {f.id}: {f.statement}" for f in process_facts) or "- (none)"}

Write the calls to action. Return the CtaPlan JSON."""
    return run_structured(ctx, node_key=NODE_KEY, default_prompt=DEFAULT_PROMPT, user=user, output=CtaPlan, strong=False, max_tokens=4000)
