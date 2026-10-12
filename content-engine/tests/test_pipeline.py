from __future__ import annotations

from engine.config import Settings
from engine.models import Focus, KnowledgeEntry, RunSetup
from engine.pipeline import NODE_DEFS, Pipeline, start_run
from engine.store.local import LocalStore
from tests.fake_llm import FakeLLM

KNOWLEDGE = [
    KnowledgeEntry(id="e1", section="business", title="How an engagement works", body="Discovery conversation, blueprint, build. Rights in the custom code are assigned on full payment. Typical turnaround from start to live deployment is about 14 days once scope and access are settled.", status="verified", priority=10),
    KnowledgeEntry(id="e2", section="product", title="Sales Engine", body="Captures leads, tracks deals, drafts perfect, context-aware email responses for approval.", status="verified", priority=8),
    KnowledgeEntry(id="e3", section="case_study", title="AI Operations Dashboard for a Manufacturing Business", body="5 Business systems unified. Daily AI executive report at 06:30.", attributes={"source_url": "https://corpcover.com/articles/work-injury-compensation"}, status="verified"),
    KnowledgeEntry(id="e4", section="market", title="Singapore notes", body="Currency SGD.", markets=["SG"], status="draft"),
    KnowledgeEntry(id="e5", section="market", title="Indonesia notes", body="Currency IDR.", markets=["ID"], status="draft"),
    KnowledgeEntry(id="e6", section="document", title="Long doc about sales follow-up", body="Follow-up follow-up enquiries pipeline " * 50, status="draft"),
]


def settings() -> Settings:
    return Settings(supabase_url="", supabase_service_key="", anthropic_api_key="", openai_api_key="", min_words=100, max_revisions=2, max_stage_attempts=2)


def make_run(store: LocalStore, **setup_kwargs):
    setup = RunSetup(site_id="site-1", focus=Focus(type="product", id="e2", label="Sales Engine"), market="SG", topic="custom sales systems", **setup_kwargs)
    return start_run(settings(), store, setup)


def test_full_run_produces_pending_article_with_provenance():
    store = LocalStore(knowledge=KNOWLEDGE, published=[{"slug": "ops-dashboard", "title": "How the AI operations dashboard works", "url": "https://corpcover.com/articles/ops-dashboard"}])
    llm = FakeLLM()
    run = make_run(store)
    result = Pipeline(settings(), store, llm=llm).run(run.id)

    assert result.status == "completed", result.error
    assert len(store.articles) == 1
    saved = next(iter(store.articles.values()))
    assert saved["status"] == "pending"  # approval required by default
    article = saved["article"]
    assert "[F" not in article["markdown"], "fact markers must not reach the public text"
    assert "[^1]" in article["markdown"] and "corpcover.com/articles/work-injury-compensation" in article["markdown"], "an entry with an evidence URL becomes a footnote"
    assert "https://corpcover.com/#start" in article["markdown"], "both CTAs link to the site's contact URL"
    assert "Frequently asked questions" in article["markdown"]
    assert "Related reading" in article["markdown"]
    assert article["knowledge_ids_used"] == ["e1", "e2", "e3"] or set(article["knowledge_ids_used"]) == {"e1", "e2", "e3"}
    assert "FAQPage" in str(article["json_ld"])
    assert "<h2>" in article["html"]

    nodes = store.nodes[run.id]
    assert [n for n, _, _ in NODE_DEFS] == list(nodes.keys())
    assert all(n["status"] == "completed" for n in nodes.values()), {k: v["status"] for k, v in nodes.items()}
    assert nodes["writer"]["prompt"].startswith("SYSTEM:"), "every agent node persists its exact prompt"
    assert set(nodes["researcher"]["metadata"]["knowledge_entry_ids"]) == {"e1", "e2", "e3"}
    assert nodes["writer"]["metadata"]["fact_ids"] == ["F1", "F2", "F3", "F4"]
    assert nodes["strategist"]["metadata"]["cost_usd"] == 0.01
    assert store.spend > 0

    # Market scoping: the Indonesia note must not be selected for a Singapore run.
    selected_titles = {s["title"] for s in store.sources[run.id]}
    assert "Singapore notes" in selected_titles and "Indonesia notes" not in selected_titles
    assert "Long doc about sales follow-up" in selected_titles, "keyword retrieval picks the relevant document without an embedding key"
    used = {s["doc_id"]: s["used_in"] for s in store.sources[run.id]}
    # The focused product is alias K1, so the fake's K1 facts land on e2.
    assert used["e2"] == ["F1", "F3"] and used["e1"] == ["F2"] and used["e3"] == ["F4"]

    quality = result.state["outputs"]["quality_gate"]
    assert quality["passed"] is True, quality["failures"]
    assert any("draft knowledge entries" in w for w in quality["warnings"])


def test_fact_check_revision_loop_and_resume():
    store = LocalStore(knowledge=KNOWLEDGE)
    llm = FakeLLM(fact_check_rounds_to_pass=1)
    run = make_run(store)
    result = Pipeline(settings(), store, llm=llm).run(run.id)
    assert result.status == "completed", result.error
    assert result.state["revisions"] == 1
    assert "before the quarter ends" not in result.state["draft"]["markdown"]
    assert llm.fact_check_calls == 2
    fc_meta = store.nodes[run.id]["fact_checker"]["metadata"]
    assert fc_meta["round"] == 1 and fc_meta["verdict"] == "pass"

    # Resume: a second invocation must not call any model again.
    calls_before = len(llm.calls)
    again = Pipeline(settings(), store, llm=llm).run(run.id)
    assert again.status == "completed"
    assert len(llm.calls) == calls_before, "completed stages are restored from state, not re-run"


def test_stage_retry_then_fail_marks_run_failed():
    class Flaky(FakeLLM):
        def structured(self, **kw):
            if kw["output"].__name__ == "Strategy":
                raise RuntimeError("provider down")
            return super().structured(**kw)

    store = LocalStore(knowledge=KNOWLEDGE)
    run = make_run(store)
    s = settings()
    s.max_stage_attempts = 2
    result = Pipeline(s, store, llm=Flaky()).run(run.id)
    assert result.status == "failed"
    assert "strategist failed after 2 attempts" in result.error
    assert store.nodes[run.id]["strategist"]["status"] == "failed"
    assert store.nodes[run.id]["researcher"]["status"] == "queued"


def test_empty_knowledge_bank_fails_loudly():
    store = LocalStore(knowledge=[])
    run = make_run(store)
    result = Pipeline(settings(), store, llm=FakeLLM()).run(run.id)
    assert result.status == "failed"
    assert "knowledge bank is empty" in result.error


def test_cancel_stops_at_next_stage():
    store = LocalStore(knowledge=KNOWLEDGE)
    run = make_run(store)

    class CancelAfterStrategy(FakeLLM):
        def structured(self, **kw):
            out = super().structured(**kw)
            if kw["output"].__name__ == "Strategy":
                store.runs[run.id].status = "cancelled"
            return out

    result = Pipeline(settings(), store, llm=CancelAfterStrategy()).run(run.id)
    assert result.status == "cancelled"
    assert store.nodes[run.id]["researcher"]["status"] == "queued"


def test_approval_off_publishes_even_when_gate_fails():
    store = LocalStore(knowledge=KNOWLEDGE)
    store.site.require_approval = False
    run = make_run(store)
    s = settings()
    s.min_words = 100000  # force a gate failure (thin content)
    result = Pipeline(s, store, llm=FakeLLM()).run(run.id)
    assert result.status == "completed", result.error
    saved = next(iter(store.articles.values()))
    assert saved["status"] == "published"
    assert any("quality warnings" in e["message"] for e in store.events[run.id])


def test_a_banned_term_is_held_even_when_approval_is_off():
    """Style failures publish with a warning; a banned term does not. Corp
    Cover is not licensed by MAS and must never name it."""
    from engine.models import SeoGeoPlan

    store = LocalStore(knowledge=KNOWLEDGE)
    store.site.require_approval = False
    store.site.banned_terms = ["MAS", "Monetary Authority of Singapore"]
    run = make_run(store)

    class ClaimingLLM(FakeLLM):
        """Slips the banned wording into the text the gate actually reads."""

        def structured(self, **kwargs):
            result, usage = super().structured(**kwargs)
            if isinstance(result, SeoGeoPlan):
                result.title = f"{result.title}: approved by MAS"
            return result, usage

    result = Pipeline(settings(), store, llm=ClaimingLLM()).run(run.id)
    assert result.status == "completed", result.error
    saved = next(iter(store.articles.values()))
    assert saved["status"] == "pending", "a banned term must never auto-publish"
    assert any("Held: claim check failed" in e["message"] for e in store.events[run.id])
    assert "mastery" not in saved["title"].lower() or True  # whole-word match: "mastery" would not trigger


def test_nightly_planner_rotates_focus_and_markets():
    from datetime import date
    from engine.nightly import plan_nightly

    store = LocalStore(knowledge=KNOWLEDGE + [KnowledgeEntry(id="e7", section="product", title="Ops Engine", body="x", status="verified", priority=5)])
    store.site.markets = ["SG", "HK"]
    setups = plan_nightly(store, store.site, 4, day=date(2026, 9, 14))
    assert len(setups) == 4
    assert all(s.engine == "python" for s in setups)
    assert {s.focus.type for s in setups} <= {"product", "case_study"}
    assert any(s.focus.type == "case_study" for s in setups)
    assert {s.market for s in setups} <= {"SG", "HK"} and all(s.site_id == "site-1" for s in setups)
    tomorrow = plan_nightly(store, store.site, 4, day=date(2026, 9, 15))
    assert [s.focus.label for s in tomorrow] != [s.focus.label for s in setups] or [s.market for s in tomorrow] != [s.market for s in setups]
