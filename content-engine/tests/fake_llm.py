"""A scripted LLM: returns canned, schema-valid outputs so the whole
pipeline runs offline in under a second. Also records every call so tests
can assert on prompts."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from engine.models import (Cta, CtaPlan, ClaimCheck, Draft, Fact, FactCheckReport, FactPack, FaqItem, InternalLink, Outline, OutlineSection,
                           ReadabilityEdit, SeoGeoPlan, Strategy, Usage)

DRAFT_MD = """The short answer is that a custom sales system pays for itself when it removes the manual follow-up your team does today. KYN builds these systems for small businesses in Singapore and the client owns the code [F1][F3].

## Why do enquiries go cold?

**Most enquiries go cold because nobody follows up within the hour.** The Sales Engine reads incoming website enquiries and drafts a reply for your team to approve [F2].

- Leads are captured automatically [F2]
- Every deal sits on one pipeline dashboard [F2]
- Follow-up reminders fire on their own [F2]

## What did this look like for a manufacturing business?

**A manufacturing client unified five business systems and gets a daily executive report.** The operations dashboard covers sales, production and cash in one place [F4].

## How long does it take?

**Typical turnaround from start to live deployment is about 14 days once scope, access and integrations are settled.** Work runs in two-week sprints so the system is live before the quarter ends [F3].

## What should you do next?

**Start by listing the three manual steps that cost your team the most hours each week.** That list is the brief for the discovery conversation [F1].
"""

REVISED_MD = DRAFT_MD.replace("before the quarter ends", "so you see results quickly")


class FakeLLM:
    def __init__(self, fact_check_rounds_to_pass: int = 0):
        self.calls: list[dict[str, Any]] = []
        self.fact_check_calls = 0
        self.rounds_to_pass = fact_check_rounds_to_pass

    def embed(self, texts: list[str]) -> None:
        return None

    def structured(self, *, system: str, user: str, output: type[BaseModel], model: str, effort: str = "high", max_tokens: int = 16000, label: str = "") -> tuple[Any, Usage]:
        self.calls.append({"label": label, "system": system, "user": user, "model": model, "output": output.__name__})
        usage = Usage(provider="fake", model=model, tokens_in=1000, tokens_out=500, cost_usd=0.01, prompt_text=f"SYSTEM:\n{system}\n\nUSER:\n{user}")
        result: Any
        if output is Strategy:
            result = Strategy(working_title="Why custom sales systems pay for themselves", reader_persona="Singapore SME owner", reader_question="Is a custom sales system worth it?",
                              thesis="A custom sales system pays back when it removes manual follow-up.", why_it_matters="Follow-up is where deals die.", primary_keyword="custom sales system Singapore",
                              secondary_keywords=["AI sales assistant", "lead follow-up automation"], geo_entities=["KYN Technology", "Sales Engine", "Singapore"],
                              geo_questions=["Is a custom sales system worth it?", "How long does it take to build?"], knowledge_ids_to_lean_on=["K1", "K2"], knowledge_gaps=["Typical project price range"])
        elif output is FactPack:
            result = FactPack(facts=[
                Fact(id="F1", statement="KYN builds custom digital systems for small and growing businesses, and rights in the custom code are assigned to the client on full payment.", knowledge_id="K1", quote="Rights in the custom code are assigned on full payment", kind="business", confidence="verified"),
                Fact(id="F2", statement="The Sales Engine captures leads, tracks deals on one pipeline dashboard, and drafts replies to enquiries for approval.", knowledge_id="K2", quote="drafts perfect, context-aware email responses", kind="product", confidence="verified"),
                Fact(id="F3", statement="Typical turnaround from start to live deployment is about 14 days once scope and access are settled, in two-week sprints.", knowledge_id="K1", quote="typical turnaround from start to live deployment is about 14 days", kind="business", confidence="unverified"),
                Fact(id="F4", statement="A manufacturing client had five business systems unified with a daily executive report.", knowledge_id="K3", quote="5 Business systems unified", kind="proof", confidence="verified"),
            ], gaps=["Pricing"], do_not_claim=["Cost savings percentages"])
        elif output is Outline:
            result = Outline(title="Why custom sales systems pay for themselves", answer_first_summary="It pays back when it removes manual follow-up.",
                             sections=[OutlineSection(heading="Why do enquiries go cold?", purpose="Problem", key_takeaway="Nobody follows up in time.", fact_ids=["F2"], format_hint="bullets"),
                                       OutlineSection(heading="What did this look like for a manufacturing business?", purpose="Proof", key_takeaway="Five systems unified.", fact_ids=["F4"]),
                                       OutlineSection(heading="How long does it take?", purpose="Timeline", key_takeaway="About 14 days.", fact_ids=["F3"]),
                                       OutlineSection(heading="What should you do next?", purpose="Action", key_takeaway="List your manual steps.", fact_ids=["F1"])],
                             faq_questions=["Do I own the code?"], mid_cta_after_section=2)
        elif output is Draft:
            result = Draft(title="Why custom sales systems pay for themselves", markdown=REVISED_MD if "Revision instructions" in user else DRAFT_MD)
        elif output is FactCheckReport:
            self.fact_check_calls += 1
            if self.fact_check_calls <= self.rounds_to_pass:
                result = FactCheckReport(claims=[ClaimCheck(claim="live before the quarter ends", section="How long does it take?", fact_ids=["F3"], verdict="unsupported", note="F3 does not mention quarters")],
                                         revision_instructions=["Remove 'before the quarter ends' in 'How long does it take?'; F3 only supports about 14 days."], verdict="revise")
            else:
                result = FactCheckReport(claims=[ClaimCheck(claim="client owns the code", section="intro", fact_ids=["F1"], verdict="supported"),
                                                 ClaimCheck(claim="about 14 days", section="How long does it take?", fact_ids=["F3"], verdict="needs_verification")], verdict="pass")
        elif output is SeoGeoPlan:
            md = REVISED_MD if self.rounds_to_pass else DRAFT_MD
            result = SeoGeoPlan(title="Custom Sales System Singapore: When It Pays Off", meta_description="When a custom sales system pays for itself for a Singapore SME, what KYN builds, and how long it takes to go live. Practical, no jargon.",
                                slug="custom-sales-system-singapore-when-it-pays-off", primary_keyword="custom sales system Singapore", entities=["KYN Technology", "Sales Engine"],
                                faq=[FaqItem(question="Do I own the code?", answer="Yes. Rights in the custom code are assigned to you on full payment [F1].")],
                                internal_links=[InternalLink(anchor_text="how the AI operations dashboard works", url="https://kyn.com.sg/blog/ops-dashboard")], changes_made=["Title shortened"], markdown=md)
        elif output is ReadabilityEdit:
            result = ReadabilityEdit(changes_made=["none"], markdown=user.split("Article (Markdown):\n", 1)[1].rsplit("\n\nReturn the ReadabilityEdit", 1)[0])
        elif output is CtaPlan:
            result = CtaPlan(mid=Cta(heading="See it on your own pipeline", text="Tell us how enquiries reach you today and we will show you what the Sales Engine would change.", button_label="Talk to us"),
                             end=Cta(heading="Ready to stop losing enquiries?", text="Start with a discovery conversation about your bottlenecks. You get a plain-English plan before anything is built [F1].", button_label="Start a conversation"),
                             why_contact_line="You own the code from day one [F1].")
        else:
            raise AssertionError(f"unexpected output type {output}")
        return result, usage
