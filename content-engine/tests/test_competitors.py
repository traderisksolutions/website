from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from pydantic import BaseModel

from engine.competitors import (PromptSuggestions, ToneVerdict, blog_pages, blog_url_for, classify_tone, clean_site_title, dedupe_prompts, discover_sitemaps, effective_home, focus_pages,
                                grounding_uris, is_auto_name, mentioned, parse_sitemap, parse_title, run_analysis, score, sitemap_kind, title_from_slug)
from engine.config import Settings
from engine.models import Usage
from engine.store.local import LocalStore

URLSET = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url><loc>https://provide.sg/blog/work-injury-compensation-guide</loc><lastmod>2026-09-03T08:00:00+08:00</lastmod></url>
  <url><loc>https://provide.sg/blog/public-liability-explained</loc><lastmod>2026-08-11</lastmod></url>
  <url><loc>https://provide.sg/blog/</loc></url>
  <url><loc>https://provide.sg/blog/page/2</loc></url>
  <url><loc>https://provide.sg/blog/tag/wica</loc></url>
  <url><loc>https://provide.sg/blog/category/insurance</loc></url>
  <url><loc>https://provide.sg/blog/author/jane</loc></url>
  <url><loc>https://provide.sg/blog/feed</loc></url>
  <url><loc>https://provide.sg/</loc><lastmod>2026-09-03</lastmod></url>
  <url><loc>https://provide.sg/business-insurance</loc><lastmod>2026-09-03</lastmod></url>
  <url><loc>https://provide.sg/sg/how-to-choose-a-broker-in-singapore</loc><lastmod>2026-07-01</lastmod></url>
  <url><loc>https://provide.sg/sg/contact</loc><lastmod>2026-07-01</lastmod></url>
  <url><loc>https://provide.sg/sg/one-two-three-words</loc></url>
  <url><loc>https://other.com/blog/not-ours</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://www.provide.sg/blog/public-liability-explained/</loc></url>
</urlset>"""

INDEX = """<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://provide.sg/post-sitemap.xml</loc><lastmod>2026-09-03</lastmod></sitemap>
  <sitemap><loc>https://provide.sg/page-sitemap.xml</loc></sitemap>
</sitemapindex>"""


def test_parse_sitemap_urlset_and_index():
    rows = parse_sitemap(URLSET)
    assert rows[0] == {"url": "https://provide.sg/blog/work-injury-compensation-guide", "lastmod": "2026-09-03T08:00:00+08:00"}
    assert len(rows) == 15
    assert sitemap_kind(URLSET) == "urlset"
    assert sitemap_kind(INDEX) == "sitemapindex"
    assert [r["url"] for r in parse_sitemap(INDEX)] == ["https://provide.sg/post-sitemap.xml", "https://provide.sg/page-sitemap.xml"]
    # malformed XML still yields the locs
    assert parse_sitemap("<urlset><url><loc>https://a.com/blog/x</loc></url><url><loc>https://a.com/blog/y")[0]["url"] == "https://a.com/blog/x"


def test_discover_sitemaps_from_robots_follows_index_one_level():
    pages = {
        "https://provide.sg/robots.txt": (200, "User-agent: *\nDisallow: /admin\nSitemap: https://provide.sg/sitemap_index.xml\nsitemap: https://provide.sg/news-sitemap.xml\n"),
        "https://provide.sg/sitemap_index.xml": (200, INDEX),
        "https://provide.sg/news-sitemap.xml": (200, URLSET),
        "https://provide.sg/post-sitemap.xml": (200, URLSET),
        "https://provide.sg/page-sitemap.xml": (200, URLSET),
    }
    calls: list[str] = []

    def fetch(url):
        calls.append(url)
        return pages.get(url, (404, ""))

    found = discover_sitemaps("https://www.provide.sg/some/path", fetch)
    assert found == ["https://provide.sg/post-sitemap.xml", "https://provide.sg/page-sitemap.xml", "https://provide.sg/news-sitemap.xml"]
    assert calls[0] == "https://provide.sg/some/path/sitemap.xml"  # the prefix sitemap is tried first
    assert calls[1] == "https://provide.sg/robots.txt"


def test_discover_sitemaps_falls_back_to_default_names_and_caps():
    many = "<sitemapindex>" + "".join(f"<sitemap><loc>https://provide.sg/s{i}.xml</loc></sitemap>" for i in range(80)) + "</sitemapindex>"
    pages = {"https://provide.sg/robots.txt": (200, "User-agent: *\n"), "https://provide.sg/sitemap.xml": (404, ""), "https://provide.sg/sitemap_index.xml": (200, many)}
    found = discover_sitemaps("provide.sg", lambda u: pages.get(u, (404, "")))
    assert len(found) == 60 and found[0] == "https://provide.sg/s0.xml"
    # nothing anywhere: empty, no exception
    assert discover_sitemaps("https://provide.sg", lambda u: (0, "")) == []


def test_blog_filter_keeps_articles_drops_noise_and_dedupes():
    pages = blog_pages(parse_sitemap(URLSET), "provide.sg")
    urls = [p["url"] for p in pages]
    assert urls == [
        "https://provide.sg/blog/work-injury-compensation-guide",
        "https://provide.sg/blog/public-liability-explained",
        "https://provide.sg/sg/how-to-choose-a-broker-in-singapore",  # dated, depth 2, 3+ word slug
    ]
    assert pages[0]["published_at"] == "2026-09-03" and pages[0]["title"] == "Work injury compensation guide"
    assert pages[1]["published_at"] == "2026-08-11"
    assert blog_url_for(pages, "provide.sg") == "https://provide.sg/blog"


def test_blog_filter_respects_path_prefix_for_global_domains():
    entries = [
        {"url": "https://www.howdengroup.com/sg-en/insights/trade-credit-insurance-explained", "lastmod": "2026-09-01"},
        {"url": "https://www.howdengroup.com/SG-EN/insights/directors-and-officers-cover", "lastmod": "2026-08-01"},
        {"url": "https://www.howdengroup.com/uk-en/insights/trade-credit-insurance-explained", "lastmod": "2026-09-01"},
        {"url": "https://www.howdengroup.com/insights/global-article-three-words", "lastmod": "2026-09-01"},
        {"url": "https://www.howdengroup.com/sg-en", "lastmod": "2026-09-01"},
        {"url": "https://www.howdengroup.com/sg-en/insights/tag/trade", "lastmod": ""},
    ]
    pages = blog_pages(entries, "howdengroup.com", "/sg-en")
    assert [p["url"] for p in pages] == [
        "https://www.howdengroup.com/sg-en/insights/trade-credit-insurance-explained",
        "https://www.howdengroup.com/SG-EN/insights/directors-and-officers-cover",
    ]
    assert blog_url_for(pages, "howdengroup.com", "/sg-en") == "https://howdengroup.com/sg-en/insights"
    # without a prefix every region's article counts
    assert len(blog_pages(entries, "howdengroup.com")) == 4


def test_blog_filter_caps_at_2000():
    entries = [{"url": f"https://a.com/blog/post-{i}", "lastmod": ""} for i in range(2500)]
    assert len(blog_pages(entries, "a.com")) == 2000


def test_titles_and_names():
    assert title_from_slug("https://a.com/blog/how-to-choose-a-broker.html") == "How to choose a broker"
    assert parse_title("<html><head><title>  Work injury\n cover | Provide </title></head></html>") == "Work injury cover | Provide"
    assert parse_title('<meta property="og:title" content="OG wins &amp; more"><title>x</title>') == "OG wins & more"
    assert parse_title("<p>no title</p>") == ""
    assert clean_site_title("Provide – Business insurance made simple") == "Provide"
    assert clean_site_title("Chubb | Singapore") == "Chubb"
    assert clean_site_title("Marsh - Global") == "Marsh"
    assert is_auto_name("Provide", "provide.sg") and is_auto_name("provide.sg", "provide.sg") and not is_auto_name("Provide Insurance Brokers", "provide.sg")


def test_score_counts_domains_pages_best_page_and_site_line():
    competitors = [{"id": "c1", "domain": "provide.sg"}, {"id": "c2", "domain": "aon.com"}]
    pages = [
        {"competitor_id": "c1", "url": "https://provide.sg/blog/a", "published_at": "2026-01-01"},
        {"competitor_id": "c1", "url": "https://provide.sg/blog/b", "published_at": "2026-06-01"},
        {"competitor_id": "c2", "url": "https://aon.com/insights/x", "published_at": "2026-02-01"},
        {"competitor_id": "c2", "url": "https://aon.com/insights/y", "published_at": "2026-03-01"},
    ]
    results = [
        {"cited_urls": ["https://www.provide.sg/blog/a/", "https://corpcover.com/articles/z"], "search_urls": ["https://provide.sg/blog/b", "https://aon.com/insights/x"]},
        {"cited_urls": ["https://provide.sg/blog/a"], "search_urls": ["https://provide.sg/blog/a", "https://corpcover.com/"]},
        {"cited_urls": [], "search_urls": ["https://aon.com/insights/x"]},
    ]
    sc = score(competitors, pages, results, "corpcover.com")
    assert sc["competitors"]["c1"] == {"cited_count": 2, "search_hits": 2, "best_page_url": "https://provide.sg/blog/a", "best_page_note": "cited in 2 answers · top 10 for 1 searches"}
    # no citations: search hits decide; equal search hits: newest wins
    assert sc["competitors"]["c2"]["cited_count"] == 0 and sc["competitors"]["c2"]["search_hits"] == 2
    assert sc["competitors"]["c2"]["best_page_url"] == "https://aon.com/insights/x"
    assert sc["pages"]["https://provide.sg/blog/b"] == {"cited": 0, "search": 1}
    assert sc["site"] == {"cited": 1, "top10": 1}
    # no pages → no best page, no crash
    assert score([{"id": "c3", "domain": "none.com"}], [], results)["competitors"]["c3"]["best_page_url"] is None


class _Explode:
    def structured(self, **kwargs):
        raise AssertionError("model must not be called when the site is not mentioned")


def test_tone_decided_in_code_when_not_mentioned():
    assert not mentioned("Corp Cover", "corpcover.com", "Provide and Aon are the usual names.", ["https://provide.sg/blog/a"])
    assert classify_tone(_Explode(), "Corp Cover", "corpcover.com", "Provide and Aon are the usual names.", ["https://provide.sg/blog/a"]) == "not_mentioned"
    assert mentioned("Corp Cover", "corpcover.com", "CorpCover is a broker.", [])
    assert mentioned("Corp Cover", "corpcover.com", "see this guide", ["https://www.corpcover.com/articles/x"])
    # mentioned: the model's verdict is used; anything outside the three values becomes neutral
    assert classify_tone(_FakeLLM(tone="negative"), "Corp Cover", "corpcover.com", "Corp Cover is slow.", []) == "negative"
    assert classify_tone(_FakeLLM(tone="rubbish"), "Corp Cover", "corpcover.com", "Corp Cover is fine.", []) == "neutral"


def test_dedupe_prompts_skips_existing_and_repeats_and_fills_impressions():
    existing = ["Do I need work injury compensation insurance for my staff?"]
    gsc = {"work injury compensation insurance": 120}
    new = [
        {"prompt": "do i need work injury compensation insurance for my staff", "search_query": "wica insurance"},  # same as existing
        {"prompt": "How much does work injury compensation insurance cost in Singapore?", "search_query": "Work Injury Compensation Insurance"},
        {"prompt": "How much does work injury compensation insurance cost in Singapore?", "search_query": "x"},  # repeat
        {"prompt": "What does public liability insurance cover for a cafe?", "search_query": "public liability insurance cafe"},
        {"prompt": "short", "search_query": ""},
    ]
    rows = dedupe_prompts(new, existing, gsc, want=50)
    assert [r["prompt"] for r in rows] == ["How much does work injury compensation insurance cost in Singapore?", "What does public liability insurance cover for a cafe?"]
    assert rows[0]["impressions"] == 120 and rows[0]["search_query"] == "work injury compensation insurance" and rows[0]["source"] == "analysis"
    assert rows[1]["impressions"] is None
    # room is want - existing
    assert len(dedupe_prompts(new, existing, gsc, want=2)) == 1
    assert dedupe_prompts(new, existing, gsc, want=1) == []


# --- an offline analysis -----------------------------------------------------------

class _FakeLLM:
    def __init__(self, tone: str = "positive"):
        self.tone = tone
        self.calls: list[str] = []

    def structured(self, *, system: str, user: str, output: type[BaseModel], model: str, effort: str = "high", max_tokens: int = 16000, label: str = "") -> tuple[Any, Usage]:
        self.calls.append(label)
        usage = Usage(provider="fake", model=model, tokens_in=2000, tokens_out=800, cost_usd=0.002)
        if output is PromptSuggestions:
            return PromptSuggestions.model_validate({"prompts": [
                {"prompt": "How much does work injury compensation insurance cost in Singapore?", "search_query": "work injury compensation insurance cost"},
                {"prompt": "Do I need public liability insurance for a small cafe in Singapore?", "search_query": "public liability insurance cafe"},
                {"prompt": "Which broker should a Singapore SME use for business insurance?", "search_query": "business insurance broker singapore"},  # already exists
            ]}), usage
        if output is ToneVerdict:
            return ToneVerdict(tone=self.tone), usage
        raise AssertionError(output)


def _response(text: str, uris: list[str], tokens_in: int = 1000, tokens_out: int = 300):
    chunks = [SimpleNamespace(web=SimpleNamespace(uri=u, title="", domain=""), retrieved_context=None) for u in uris]
    return SimpleNamespace(
        text=text,
        candidates=[SimpleNamespace(grounding_metadata=SimpleNamespace(grounding_chunks=chunks))],
        usage_metadata=SimpleNamespace(prompt_token_count=tokens_in, candidates_token_count=tokens_out, thoughts_token_count=0),
    )


class _FakeGemini:
    """generate_content: 'Search:' requests list results; others answer. One prompt explodes."""

    def __init__(self):
        self.calls: list[str] = []
        self.models = self

    def generate_content(self, *, model: str, contents: str, config: Any):
        self.calls.append(contents)
        if "explode" in contents:
            raise RuntimeError("503 model overloaded")
        if contents.startswith("Search: "):
            return _response("1. ...", ["https://provide.sg/blog/public-liability-explained", "https://corpcover.com/articles/liability", "https://aon.com/insights/x"])
        if "cafe" in contents:
            return _response("Corp Cover and Provide both explain this well.", ["https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", "https://provide.sg/blog/public-liability-explained"])
        return _response("Provide has a guide on this.", ["https://provide.sg/blog/work-injury-compensation-guide"])


ROBOTS = "Sitemap: https://provide.sg/sitemap.xml\n"
HOME = "<html><head><title>Provide – Insurance for Singapore businesses</title></head></html>"


def _fetch(url: str) -> tuple[int, str]:
    table = {
        "https://provide.sg/robots.txt": (200, ROBOTS),
        "https://provide.sg/sitemap.xml": (200, URLSET),
        "https://provide.sg": (200, HOME),
        "https://provide.sg/blog/work-injury-compensation-guide": (200, "<title>WICA guide 2026 | Provide</title>"),
    }
    return table.get(url, (404, ""))


def _settings() -> Settings:
    return Settings(supabase_url="", supabase_service_key="", anthropic_api_key="", openai_api_key="", gemini_api_key="", analysis_model="gemini-3.8-flash", analysis_max_prompts=60)


def test_run_analysis_offline_completes_with_counts_scores_and_cost():
    store = LocalStore()
    store.gsc = {"work injury compensation insurance cost": 44}
    c = store.add_competitor("https://provide.sg", "provide.sg")  # name = Provide (auto)
    store.add_prompt("Which broker should a Singapore SME use for business insurance?", "business insurance broker singapore", selected=True)
    store.add_prompt("Please explode", "boom")
    store.add_prompt("Archived one", "", archived=True)
    analysis = store.add_analysis()
    llm, client = _FakeLLM(), _FakeGemini()
    resolve = lambda u: "https://www.corpcover.com/articles/cafe-cover" if "grounding-api-redirect" in u else u  # noqa: E731

    out = run_analysis(_settings(), store, analysis["id"], fetch=_fetch, client=client, llm=llm, resolve=resolve, home=lambda u: u)

    assert out["status"] == "completed", out.get("error")
    assert out["model"] == "gemini-3.8-flash"
    # sweep
    comp = store.competitors[c["id"]]
    assert comp["pages_count"] == 3 and comp["blog_url"] == "https://provide.sg/blog" and comp["sitemap_url"] == "https://provide.sg/sitemap.xml"
    assert comp["name"] == "Provide"  # homepage title before ' – '
    assert store.pages[(c["id"], "https://provide.sg/blog/work-injury-compensation-guide")]["title"] == "WICA guide 2026 | Provide"
    assert store.pages[(c["id"], "https://provide.sg/blog/public-liability-explained")]["title"] == "Public liability explained"  # slug title (404)
    # prompts: one suggest call, two new rows (the third duplicated an existing prompt), impressions from GSC
    assert llm.calls.count("suggest_prompts") == 1
    prompts = {p["prompt"]: p for p in store.list_prompts("site-1")}
    assert len(prompts) == 4 and out["summary"]["prompts_suggested"] == 2
    assert prompts["How much does work injury compensation insurance cost in Singapore?"]["impressions"] == 44
    # results: 4 non-archived prompts checked, one failed and recorded, the run still completed
    assert out["prompts_checked"] == 3 and out["pages_read"] == 3
    assert any("prompt" in e and "503" in e for e in out["summary"]["errors"])
    results = {r["prompt_id"]: r for r in store.results[analysis["id"]]}
    cafe = next(r for r in results.values() if r["us_cited"])
    assert cafe["tone"] == "positive" and "corpcover.com" in cafe["cited_domains"] and cafe["cited_urls"][0] == "https://www.corpcover.com/articles/cafe-cover"
    other = next(r for r in results.values() if not r["us_cited"])
    assert other["tone"] == "not_mentioned" and other["search_urls"][0] == "https://provide.sg/blog/public-liability-explained"
    assert llm.calls.count("classify_tone") == 1, "tone model called only for the answer that mentions the site"
    # scores
    assert comp["cited_count"] == 3 and comp["search_hits"] == 3
    assert comp["best_page_url"] == "https://provide.sg/blog/work-injury-compensation-guide"  # cited 2 beats cited 1 + top-10 in 3 searches
    assert comp["best_page_note"] == "cited in 2 answers · top 10 for 0 searches"
    assert store.pages[(c["id"], "https://provide.sg/blog/work-injury-compensation-guide")]["cited_count"] == 2
    assert store.pages[(c["id"], "https://provide.sg/blog/public-liability-explained")]["search_hits"] == 3
    assert out["cited_count"] == 1 and out["summary"]["site"] == {"pages": 0, "cited": 1, "top10": 3}
    # cost: 6 grounded calls at gemini-3.8-flash rates (1000 in, 300 out each) + 2 structured calls at 0.002
    grounded_each = (1000 * 0.75 + 300 * 3.75) / 1_000_000
    assert abs(out["cost_usd"] - (6 * grounded_each + 2 * 0.002)) < 1e-6
    assert out["completed_at"] and out["started_at"]


def test_run_analysis_marks_failed_when_the_site_lookup_breaks():
    store = LocalStore()
    analysis = store.add_analysis()

    def boom(site_id):
        raise RuntimeError("site row missing " + "x" * 600)

    store.site_info = boom  # type: ignore[method-assign]
    out = run_analysis(_settings(), store, analysis["id"], fetch=_fetch, client=_FakeGemini(), llm=_FakeLLM())
    assert out["status"] == "failed" and out["error"].startswith("site row missing") and len(out["error"]) == 500
    assert run_analysis(_settings(), store, "missing-id", fetch=_fetch, client=_FakeGemini(), llm=_FakeLLM()) is None


def test_grounding_uris_tolerates_missing_metadata():
    assert grounding_uris(SimpleNamespace(candidates=[])) == []
    assert grounding_uris(SimpleNamespace(candidates=[SimpleNamespace(grounding_metadata=None)])) == []
    assert grounding_uris(_response("x", ["https://a.com", "https://a.com", "https://b.com"])) == ["https://a.com", "https://b.com"]


INDEX_MANY = """<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
""" + "".join(f"<sitemap><loc>https://www.chubb.com/{loc}/sitemap.xml</loc></sitemap>" for loc in ["ar-es", "au-en", "br-pt", "sg-en", "us-en"]) + "</sitemapindex>"


def test_discover_sitemaps_prefers_prefix_sitemap_and_prefix_children():
    pages = {
        "https://chubb.com/robots.txt": (200, "Sitemap: https://chubb.com/sitemapindex.xml\n"),
        "https://chubb.com/sitemapindex.xml": (200, INDEX_MANY),
        "https://chubb.com/sg-en/sitemap.xml": (200, URLSET),
    }
    out = discover_sitemaps("https://www.chubb.com/sg-en", lambda u: pages.get(u, (404, "")))
    assert out[0] == "https://chubb.com/sg-en/sitemap.xml"           # the prefix's own sitemap first
    rest = [u for u in out[1:]]
    assert rest[0] == "https://www.chubb.com/sg-en/sitemap.xml" or rest[0].endswith("/sg-en/sitemap.xml") or "sg-en" in rest[0]
    assert "https://www.chubb.com/ar-es/sitemap.xml" in out and out.index("https://www.chubb.com/ar-es/sitemap.xml") > out.index(next(u for u in out if "sg-en" in u))


def test_focus_pages_narrows_a_broad_publisher_only():
    mk = lambda i, slug: {"url": f"https://singsaver.com.sg/blog/{slug}-{i}", "title": ""}
    pages = [mk(i, "best-credit-card") for i in range(300)] + [mk(i, "work-injury-insurance-guide") for i in range(25)]
    kept = focus_pages(pages, ["insurance", "work injury"], threshold=300, keep_min=20)
    assert len(kept) == 25 and all("insurance" in p["url"] for p in kept)
    assert focus_pages(pages[:100], ["insurance"], threshold=300) == pages[:100]          # small blog untouched
    assert len(focus_pages(pages[:305], ["insurance"], threshold=300, keep_min=20)) == 305  # too few hits: keep all


def test_effective_home_follows_a_host_move_and_a_locale_redirect():
    assert effective_home("https://libertyinsurance.com.sg", "libertyinsurance.com.sg", "https://www.libertyinternational.com/sg") == ("https://libertyinternational.com/sg", "libertyinternational.com", "/sg")
    assert effective_home("https://www.howdengroup.com/sg-en", "howdengroup.com", "https://www.howdengroup.com/sg-en") == ("https://www.howdengroup.com/sg-en", "howdengroup.com", "/sg-en")
    assert effective_home("https://anapi.co", "anapi.co", "") == ("https://anapi.co", "anapi.co", "")


def test_blog_filter_knows_insight_and_post_sections():
    entries = [{"url": "https://www.howdengroup.com/sg-en/insight/countering-talent-shortage", "lastmod": ""}, {"url": "https://anapi.co/post/social-engineering-fraud", "lastmod": ""}]
    assert len(blog_pages(entries, "howdengroup.com", "/sg-en")) == 1
    assert len(blog_pages(entries, "anapi.co")) == 1
