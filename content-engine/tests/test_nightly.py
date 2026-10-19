from __future__ import annotations

from datetime import date

from engine.models import KnowledgeEntry
from engine.nightly import plan_nightly
from engine.store.local import LocalStore, default_site

KNOWLEDGE = [
    KnowledgeEntry(id="p1", section="product", title="Work injury compensation", body="WICA cover.", status="verified", priority=10),
    KnowledgeEntry(id="p2", section="product", title="Public liability", body="PL cover.", status="verified", priority=8),
    KnowledgeEntry(id="c1", section="case_study", title="A cafe chain", body="Three outlets covered.", status="verified"),
]

GSC_ROWS = [
    {"query": "public liability policy excess", "page": "https://corpcover.com/articles/liability-101", "impressions": 4, "position": 8.5},
    {"query": "work injury compensation insurance for contractors", "page": "https://corpcover.com/articles/guide", "impressions": 5, "position": 16.0},
]


def make_store(article_length: str = "standard") -> LocalStore:
    site = default_site()
    site.topic_terms = ["insurance", "liability", "work injury"]
    site.article_length = article_length
    store = LocalStore(knowledge=KNOWLEDGE, site=site)
    store._queries = list(GSC_ROWS)
    return store


def test_prompts_first_by_impressions_then_gsc_then_rotation():
    store = make_store(article_length="long")
    low = store.add_prompt("What does fire insurance cover for a shophouse?", "fire insurance shophouse", impressions=3, selected=True)
    high = store.add_prompt("How much is work injury compensation insurance for a cafe?", "wica insurance cafe", impressions=90, selected=True)
    none = store.add_prompt("Do I need directors liability cover as a sole director?", "", impressions=None, selected=True)
    store.add_prompt("Unticked prompt about marine cargo cover", "marine cargo", impressions=500, selected=False)
    store.add_prompt("Archived prompt about bonds", "bonds", impressions=900, selected=True, archived=True)

    setups = plan_nightly(store, store.site, 6, day=date(2026, 10, 19))
    assert len(setups) == 6
    assert [s.prompt_id for s in setups[:3]] == [high["id"], low["id"], none["id"]], "impressions desc, None last"
    first = setups[0]
    assert first.focus.type == "question" and first.focus.label == high["prompt"]
    assert first.topic == first.reader_question == high["prompt"]
    assert first.target_query == "wica insurance cafe" and first.length == "long"
    assert first.objective == "answer this question so AI assistants and Google cite the article"
    assert setups[2].target_query == none["prompt"], "no search query → the prompt itself"
    # then Search Console targets (impressions desc), then the rotation
    assert [s.target_query for s in setups[3:5]] == ["work injury compensation insurance for contractors", "public liability policy excess"]
    assert all(not s.prompt_id and s.target_position > 0 for s in setups[3:5])
    assert setups[5].focus.type in ("product", "case_study") and not setups[5].prompt_id and not setups[5].target_query
    assert all(s.length == "long" for s in setups)


def test_count_is_respected_and_prompts_take_precedence():
    store = make_store()
    for i in range(4):
        store.add_prompt(f"Prompt number {i} about liability insurance?", f"liability {i}", impressions=10 - i, selected=True)
    setups = plan_nightly(store, store.site, 2)
    assert len(setups) == 2 and all(s.prompt_id for s in setups)
    assert [s.topic for s in setups] == ["Prompt number 0 about liability insurance?", "Prompt number 1 about liability insurance?"]


def test_no_prompt_twice_while_its_run_has_an_article_or_is_in_flight():
    store = make_store()
    done = store.add_prompt("Prompt with an article already?", "", impressions=100, selected=True)
    running = store.add_prompt("Prompt being written right now?", "", impressions=90, selected=True)
    failed = store.add_prompt("Prompt whose run failed without an article?", "", impressions=80, selected=True)
    fresh = store.add_prompt("Prompt never attempted?", "", impressions=1, selected=True)

    def seed_run(prompt_id: str, status: str, article_id: str = "") -> None:
        setup = plan_nightly(store, store.site, 1)[0]
        setup.prompt_id = prompt_id
        run = store.create_run(store.site.id, setup, [], triggered_by="scheduled")
        store.update_run(run.id, status=status, article_id=article_id)

    seed_run(done["id"], "completed", article_id="art-1")
    seed_run(running["id"], "running")
    seed_run(failed["id"], "failed")

    setups = plan_nightly(store, store.site, 2)
    assert [s.prompt_id for s in setups] == [failed["id"], fresh["id"]], "a failed run without an article frees the prompt; done and running do not"


def test_falls_back_to_gsc_then_rotation_without_prompts():
    store = make_store()
    setups = plan_nightly(store, store.site, 3, day=date(2026, 10, 19))
    assert [s.target_query for s in setups[:2]] == ["work injury compensation insurance for contractors", "public liability policy excess"]
    assert setups[2].focus.type in ("product", "case_study") and setups[2].length == "standard"
    assert len(plan_nightly(store, store.site, 1)) == 1


def test_prompt_store_errors_never_stop_the_night():
    store = make_store()

    def boom(site_id):
        raise RuntimeError("relation geo_prompts does not exist")

    store.selected_prompts = boom  # type: ignore[method-assign]
    setups = plan_nightly(store, store.site, 2)
    assert len(setups) == 2 and all(not s.prompt_id for s in setups)
