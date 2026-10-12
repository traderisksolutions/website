from __future__ import annotations

from ..models import ReadabilityEdit, Usage
from ..quality import readability_metrics
from .base import AgentContext, run_structured

NODE_KEY = "readability_editor"
LABEL = "Make it scannable"

DEFAULT_PROMPT = """You are a line editor for readers who skim. Fix only the problems listed; leave everything else, including every fact marker, exactly as it is.

Standards:
- Paragraphs of 60 words or fewer. Split long ones at the natural break.
- Every H2 section starts with one bold sentence that states its takeaway.
- Sentences average under 20 words. Break up long sentences; do not delete content.
- Lists for list-shaped content: three or more parallel items become bullets or steps.
- No filler openers, no em dashes, no jargon a business owner would not use.
- Keep the language, spelling and currency as they are.
Return the full Markdown with fixes applied and a short list of changes."""


def run(ctx: AgentContext, markdown: str) -> tuple[ReadabilityEdit, Usage]:
    metrics = readability_metrics(markdown)
    problems = metrics.get("problems", [])
    user = f"""{ctx.brief()}

Measured problems to fix:
{chr(10).join(f"- {p}" for p in problems) or "- (none measured; make only clearly beneficial line edits)"}

Article (Markdown):
{markdown}

Return the ReadabilityEdit JSON with the full Markdown in `markdown`."""
    return run_structured(ctx, node_key=NODE_KEY, default_prompt=DEFAULT_PROMPT, user=user, output=ReadabilityEdit, strong=False, max_tokens=20000)
