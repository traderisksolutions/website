"""Shared plumbing for agents: the context every agent sees, the guardrail
text appended after any editable prompt, and one helper that runs a
structured call and returns (result, usage).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TypeVar

from pydantic import BaseModel

from ..config import Settings
from ..knowledge import KnowledgeSelection, format_knowledge
from ..llm import LLM
from ..markets import Market, get_market, language_for
from ..models import RunSetup, Usage

T = TypeVar("T", bound=BaseModel)

# Unsupported superlatives and guarantees (blocked by the deterministic gate
# in quality.py), plus the house filler list — words that add length and no
# information. The gate does not fail an article for filler; the prompt keeps
# it out in the first place.
BANNED_WORDS = [
    "best", "leading", "premier", "number one", "#1", "world-class", "guarantee", "guaranteed",
    "cutting-edge", "revolutionary", "game-changing", "seamless", "best-in-class", "robust and scalable",
    "unlock", "opportunity", "powerful", "simply", "dive into", "in today's fast-paced", "cheapest", "peace of mind",
]


@dataclass
class AgentContext:
    settings: Settings
    llm: LLM
    setup: RunSetup
    knowledge: KnowledgeSelection
    business_name: str
    domain: str
    prompt_overrides: dict[str, str] = field(default_factory=dict)
    published_articles: list[dict[str, str]] = field(default_factory=list)  # {slug,title,url}

    @property
    def market(self) -> Market:
        return get_market(self.setup.market)

    @property
    def language(self) -> str:
        return language_for(self.setup.market, self.setup.language or None)

    @property
    def language_name(self) -> str:
        return "Bahasa Indonesia" if self.language == "id" else "English"

    @property
    def spelling(self) -> str:
        return "formal Bahasa Indonesia" if self.language == "id" else self.market.spelling

    def knowledge_block(self) -> str:
        return format_knowledge(self.knowledge)

    def focus_line(self) -> str:
        f = self.setup.focus
        if f.type == "topic" and not f.label:
            return "No specific product focus — write a general piece for this business."
        if f.type == "question":
            return f'Focus: answer the search "{f.label}" completely, and show where the business\'s own work and products help with it.'
        alias = f" (knowledge entry {self.knowledge.focus_alias})" if self.knowledge.focus_alias else ""
        return f"Focus: highlight the {f.type.replace('_', ' ')} \"{f.label}\"{alias}. The article must make a reader want this specific thing."

    def brief(self) -> str:
        """The stable header every agent sees. Kept identical across stages
        so the cached system prefix is reused."""
        s = self.setup
        lines = [
            f"Business: {self.business_name} ({self.domain}).",
            f"Target market: {self.market.name} ({self.market.code}). Currency: {self.market.currency}. Reader: {self.market.reader_hint}",
            f"Article language: {self.language_name}, {self.spelling}.",
            self.focus_line(),
            f"Objective: {s.objective}.",
        ]
        if s.topic:
            lines.append(f"Requested topic: {s.topic}")
        if s.reader_question:
            lines.append(f"Reader question to answer: {s.reader_question}")
        if s.target_query:
            lines.append(
                f'Search target: Google already shows this site at position {s.target_position:g} for the search "{s.target_query}". '
                "This article must be the most specific, complete answer on the web to exactly that search, so it reaches page one. "
                "Use that phrase, or its natural grammatical variant, as the primary keyword in the title, the first sentence and one H2."
            )
        if s.extra_instructions:
            lines.append(f"Extra instructions from the business owner: {s.extra_instructions}")
        return "\n".join(lines)


GUARDRAILS = (
    "Non-negotiable rules (added automatically after any custom prompt):\n"
    "1. Only state things about the business, its products, results, prices, timelines or clients that the knowledge entries support. If the knowledge bank is silent, leave it out — never fill a gap with a plausible-sounding invention.\n"
    "2. Never use these words or their equivalents: " + ", ".join(BANNED_WORDS) + ". No guarantees, no unsupported numbers, no superlatives.\n"
    "3. Write for a busy business owner: short sentences, plain words, no jargon, no filler openers, no em dashes.\n"
    "3a. Sharp, concise, direct. One idea per sentence. Numbers instead of adjectives: give the figure, not \"fast\" or \"quick\". Cut every word that carries no information. Direct is not rude: state facts, never talk down to the reader or comment on their competence.\n"
    "3b. Insurance and financial products: never promise cover, a payout, an approval or a premium. State what a policy section does and what to check; a market note or approved claim must support every regulator, law or figure named.\n"
    "4. Respect the article language and market exactly as briefed.\n"
    "5. Return only the JSON the schema asks for."
)


def system_prompt(ctx: AgentContext, node_key: str, default_prompt: str) -> str:
    core = ctx.prompt_overrides.get(node_key) or default_prompt
    return f"{core.strip()}\n\n{GUARDRAILS}"


def run_structured(ctx: AgentContext, *, node_key: str, default_prompt: str, user: str, output: type[T], strong: bool, max_tokens: int = 16000) -> tuple[T, Usage]:
    system = system_prompt(ctx, node_key, default_prompt)
    model = ctx.settings.model_strong if strong else ctx.settings.model_fast
    effort = ctx.settings.effort_strong if strong else ctx.settings.effort_fast
    return ctx.llm.structured(system=system, user=user, output=output, model=model, effort=effort, max_tokens=max_tokens, label=node_key)
