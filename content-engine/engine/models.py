"""Typed contracts between stages. Every agent returns exactly one of these
models, validated against the JSON schema sent to the model, so a malformed
answer fails loudly at the stage boundary instead of corrupting later stages.

Field design rule for structured outputs: no Optional, no unions — every
field has a concrete type and a default, so the strict schema is simple.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Section = Literal["business", "product", "case_study", "claim", "market", "document"]
MarketCode = Literal["SG", "HK", "ID", "MY"]
Language = Literal["en", "id"]


class KnowledgeEntry(BaseModel):
    id: str
    section: str
    title: str
    body: str
    attributes: dict[str, Any] = Field(default_factory=dict)
    markets: list[str] = Field(default_factory=list)
    language: str = "en"
    status: str = "draft"
    priority: int = 0
    source: str = "manual"

    def evidence_url(self) -> str:
        for key in ("evidence_url", "source_url", "url"):
            value = self.attributes.get(key)
            if isinstance(value, str) and value.startswith("http"):
                return value
        return ""


class Focus(BaseModel):
    """What the user asked the engine to highlight."""
    type: str = "topic"  # product | case_study | market | topic | pillar | question
    id: str = ""
    label: str = ""


class RunSetup(BaseModel):
    engine: str = "python"
    # Which of the business's websites this article is for (marketing_sites.id).
    site_id: str = ""
    # The site's own topic label for the article ("Required by law", "Perks"), chosen
    # by the person who started the run; empty for a nightly run until approval.
    topic_label: str = ""
    focus: Focus = Field(default_factory=Focus)
    market: str = "SG"
    language: str = ""  # '' = market default
    topic: str = ""
    reader_question: str = ""
    objective: str = "bring in customers for the custom service"
    length: str = "standard"  # standard (~1200 words) | long (~2000 words)
    extra_instructions: str = ""
    contact_url: str = ""
    auto_publish: bool = False
    # A Search Console query this article is written to rank for, with the
    # site's current best position for it (0 when not from Search Console).
    target_query: str = ""
    target_position: float = 0

    def word_target(self) -> int:
        return 2000 if self.length == "long" else 1200


# --- stage outputs ---------------------------------------------------------

class Strategy(BaseModel):
    working_title: str = ""
    reader_persona: str = ""
    reader_question: str = ""
    thesis: str = Field("", description="The one non-obvious insight the article proves.")
    why_it_matters: str = ""
    content_format: str = "explainer"
    primary_keyword: str = ""
    secondary_keywords: list[str] = Field(default_factory=list)
    geo_entities: list[str] = Field(default_factory=list)
    geo_questions: list[str] = Field(default_factory=list, description="Question-form phrasings the article must answer directly.")
    knowledge_ids_to_lean_on: list[str] = Field(default_factory=list, description="K-ids of the entries the thesis rests on.")
    knowledge_gaps: list[str] = Field(default_factory=list, description="Facts a great article would need that the knowledge bank lacks.")
    avoid: list[str] = Field(default_factory=list)


class Fact(BaseModel):
    id: str = Field("", description="F1, F2, ...")
    statement: str = ""
    knowledge_id: str = Field("", description="K-id of the entry this comes from; empty only for kind=general.")
    quote: str = Field("", description="Short verbatim excerpt (<= 30 words) from the entry that supports the statement.")
    kind: str = Field("business", description="business | product | proof | market | general")
    confidence: str = Field("verified", description="verified | unverified (entry is still a draft) | general")


class FactPack(BaseModel):
    facts: list[Fact] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    do_not_claim: list[str] = Field(default_factory=list)


class OutlineSection(BaseModel):
    heading: str = ""
    purpose: str = ""
    key_takeaway: str = ""
    fact_ids: list[str] = Field(default_factory=list)
    format_hint: str = Field("prose", description="prose | bullets | steps | table | comparison")


class Outline(BaseModel):
    title: str = ""
    answer_first_summary: str = Field("", description="2-3 sentences that directly answer the reader question.")
    sections: list[OutlineSection] = Field(default_factory=list)
    faq_questions: list[str] = Field(default_factory=list)
    mid_cta_after_section: int = Field(2, description="1-based index of the section after which the mid-article CTA goes.")


class Draft(BaseModel):
    title: str = ""
    markdown: str = ""


class ClaimCheck(BaseModel):
    claim: str = ""
    section: str = ""
    fact_ids: list[str] = Field(default_factory=list)
    verdict: str = Field("supported", description="supported | unsupported | contradicted | general_knowledge | needs_verification")
    note: str = ""


class FactCheckReport(BaseModel):
    claims: list[ClaimCheck] = Field(default_factory=list)
    revision_instructions: list[str] = Field(default_factory=list)
    verdict: str = Field("pass", description="pass | revise | fail")

    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for c in self.claims:
            out[c.verdict] = out.get(c.verdict, 0) + 1
        return out

    def groundedness(self) -> float:
        checkable = [c for c in self.claims if c.verdict != "general_knowledge"]
        if not checkable:
            return 1.0
        good = sum(1 for c in checkable if c.verdict in ("supported", "needs_verification"))
        return round(good / len(checkable), 3)


class FaqItem(BaseModel):
    question: str = ""
    answer: str = ""


class InternalLink(BaseModel):
    anchor_text: str = ""
    url: str = ""


class SeoGeoPlan(BaseModel):
    title: str = ""
    meta_description: str = ""
    slug: str = ""
    primary_keyword: str = ""
    entities: list[str] = Field(default_factory=list)
    faq: list[FaqItem] = Field(default_factory=list)
    internal_links: list[InternalLink] = Field(default_factory=list)
    changes_made: list[str] = Field(default_factory=list)
    markdown: str = ""


class ReadabilityEdit(BaseModel):
    changes_made: list[str] = Field(default_factory=list)
    markdown: str = ""


class Cta(BaseModel):
    heading: str = ""
    text: str = ""
    button_label: str = ""


class CtaPlan(BaseModel):
    mid: Cta = Field(default_factory=Cta)
    end: Cta = Field(default_factory=Cta)
    why_contact_line: str = ""


class QualityFailure(BaseModel):
    code: str = ""
    message: str = ""


class QualityReport(BaseModel):
    passed: bool = True
    failures: list[QualityFailure] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)


class Article(BaseModel):
    title: str = ""
    slug: str = ""
    meta_description: str = ""
    excerpt: str = ""
    markdown: str = ""  # public markdown (markers removed, footnotes added)
    markdown_with_markers: str = ""
    html: str = ""
    json_ld: dict[str, Any] = Field(default_factory=dict)
    faq: list[FaqItem] = Field(default_factory=list)
    language: str = "en"
    market: str = "SG"
    word_count: int = 0
    fact_ids_used: list[str] = Field(default_factory=list)
    knowledge_ids_used: list[str] = Field(default_factory=list)
    scores: dict[str, Any] = Field(default_factory=dict)


class Usage(BaseModel):
    provider: str = ""
    model: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    prompt_text: str = ""
    attempts: int = 1
    latency_ms: int = 0
