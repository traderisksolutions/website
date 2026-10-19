"""Competitor analysis: read competitors' blogs from their sitemaps, suggest
the prompts a buyer would ask an AI assistant, answer each prompt with Gemini
and Google Search grounding, record who is cited and the tone toward the
site, and rank competitor pages by how often answers and searches surface them.

Pure helpers (sitemap parsing, blog filter, scoring, tone decision, prompt
dedupe) take plain data and are unit-tested. I/O is injected: `fetch(url) ->
(status, text)`, the google-genai client, and the LLM wrapper, so a whole
analysis runs offline in tests.
"""
from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timezone
from html import unescape
from typing import Any, Callable
from urllib.parse import urljoin, urlparse

from pydantic import BaseModel, Field

from .config import Settings
from .llm import LLM, estimate_cost
from .store.base import SiteInfo, Store

log = logging.getLogger("engine.competitors")

Fetch = Callable[[str], tuple[int, str]]

FETCH_TIMEOUT = 6.0
MAX_SITEMAPS = 60
# A competitor with more pages than this gets narrowed to the site's topic terms before the cap.
FOCUS_THRESHOLD = 300
MAX_PAGES = 2000
TITLE_FETCHES = 40
WANT_PROMPTS = 50
TONES = ("positive", "neutral", "negative", "not_mentioned")
GROUNDING_REDIRECT = "vertexaisearch.cloud.google.com/grounding-api-redirect/"

BLOG_SEGMENTS = {"blog", "blogs", "articles", "article", "insights", "insight", "resources", "guides", "news", "news-insights", "learn", "knowledge", "post", "posts", "stories", "updates", "press"}
DROP_SEGMENTS = {"tag", "tags", "category", "categories", "author", "authors", "feed", "feeds", "rss", "page", "topic", "topics", "search", "wp-content", "wp-json"}
DROP_PATH_RE = re.compile(r"/(page|p)/\d+/?$|[?&](page|paged|p)=\d+|/feed/?$|\.(xml|rss|atom|json|pdf|jpg|jpeg|png|gif|webp|svg|css|js)$", re.I)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- URL helpers ----------------------------------------------------------------

def domain_of(url: str) -> str:
    host = (urlparse(url if "://" in url else f"https://{url}").hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def norm_url(url: str) -> str:
    """Comparison key: lowercase host without www, no query, no fragment, no trailing slash."""
    p = urlparse(url.strip())
    host = (p.hostname or "").lower()
    host = host[4:] if host.startswith("www.") else host
    path = re.sub(r"/+$", "", p.path or "")
    return f"{host}{path}".lower()


def path_prefix_of(url: str) -> str:
    """'/sg-en' for https://www.howdengroup.com/sg-en, '' for a bare host."""
    path = re.sub(r"/+$", "", urlparse(url).path or "")
    return path.lower() if path and path != "/" else ""


def auto_name(domain: str) -> str:
    """The name the dashboard gives a competitor until the sweep finds a title."""
    return domain.split(".")[0].capitalize() if domain else ""


def is_auto_name(name: str, domain: str) -> bool:
    n = (name or "").strip().lower()
    return n in {auto_name(domain).lower(), domain.lower(), domain.rsplit(".", 1)[0].lower()}


def clean_site_title(title: str) -> str:
    """'Provide – Business insurance made simple' → 'Provide'."""
    t = re.split(r"\s+[|–—-]\s+|\s*\|\s*", unescape(title or "").strip(), maxsplit=1)[0].strip()
    return t[:80]


def title_from_slug(url: str) -> str:
    segment = [s for s in urlparse(url).path.split("/") if s][-1:] or [""]
    words = re.sub(r"\.[a-z0-9]{2,5}$", "", segment[0]).replace("-", " ").replace("_", " ").split()
    text = " ".join(words).strip()
    return text[:1].upper() + text[1:] if text else url


def parse_title(html: str) -> str:
    m = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', html, re.I) \
        or re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']', html, re.I)
    if m:
        return unescape(m.group(1)).strip()[:300]
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    return re.sub(r"\s+", " ", unescape(m.group(1))).strip()[:300] if m else ""


# --- sitemaps -------------------------------------------------------------------

def _strip_ns(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def sitemap_kind(xml: str) -> str:
    head = xml[:2000].lower()
    if "<sitemapindex" in head:
        return "sitemapindex"
    if "<urlset" in head:
        return "urlset"
    return ""


def parse_sitemap(xml: str) -> list[dict[str, str]]:
    """Entries of a urlset or a sitemapindex: [{url, lastmod}]. Namespaces ignored;
    falls back to a regex scan when the XML is malformed."""
    out: list[dict[str, str]] = []
    text = xml.lstrip("﻿ \r\n\t")
    try:
        root = ET.fromstring(text.encode("utf-8") if isinstance(text, str) else text)
        for node in root.iter():
            if _strip_ns(node.tag) not in ("url", "sitemap"):
                continue
            loc, lastmod = "", ""
            for child in node:
                tag = _strip_ns(child.tag)
                if tag == "loc":
                    loc = (child.text or "").strip()
                elif tag == "lastmod":
                    lastmod = (child.text or "").strip()
            if loc:
                out.append({"url": loc, "lastmod": lastmod})
        if out:
            return out
    except ET.ParseError:
        pass
    for m in re.finditer(r"<loc>\s*(.*?)\s*</loc>(?:\s*<lastmod>\s*(.*?)\s*</lastmod>)?", text, re.I | re.S):
        out.append({"url": unescape(m.group(1)).strip(), "lastmod": (m.group(2) or "").strip()})
    return out


def discover_sitemaps(base_url: str, fetch: Fetch) -> list[str]:
    """robots.txt `Sitemap:` lines, else the usual file names; indexes are
    followed one level. Capped at MAX_SITEMAPS. Returns urlset URLs to parse.

    A base URL with a path prefix (a global site's /sg-en) also tries
    <prefix>/sitemap.xml, and children of an index that name the prefix come
    first, so the cap never drops the one locale that matters (Chubb lists
    67 locales; Howden keeps its sg-en pages in /sg-en/sitemap.xml only)."""
    root = f"https://{domain_of(base_url)}/" if domain_of(base_url) else base_url
    prefix = path_prefix_of(base_url)
    marker = prefix.strip("/").split("/")[0] if prefix else ""
    found: list[str] = []
    if prefix:
        url = urljoin(root, f"{prefix}/sitemap.xml")
        try:
            status, body = fetch(url)
        except Exception:  # noqa: BLE001
            status, body = 0, ""
        if status == 200 and sitemap_kind(body):
            found.append(url)
    try:
        status, robots = fetch(urljoin(root, "/robots.txt"))
    except Exception:  # noqa: BLE001
        status, robots = 0, ""
    if status == 200 and robots:
        for line in robots.splitlines():
            if line.strip().lower().startswith("sitemap:"):
                url = line.split(":", 1)[1].strip()
                if url and url not in found:
                    found.append(url)
    if not found:
        for name in ("/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml"):
            url = urljoin(root, name)
            try:
                status, body = fetch(url)
            except Exception:  # noqa: BLE001
                continue
            if status == 200 and sitemap_kind(body):
                found.append(url)
                break
    out: list[str] = []
    for url in found[:MAX_SITEMAPS]:
        try:
            status, body = fetch(url)
        except Exception:  # noqa: BLE001
            continue
        if status != 200 or not body:
            continue
        if sitemap_kind(body) == "sitemapindex":
            children = [c["url"] for c in parse_sitemap(body)]
            if marker:
                children = [c for c in children if marker in c.lower()] + [c for c in children if marker not in c.lower()]
            for child in children:
                if child not in out and len(out) < MAX_SITEMAPS:
                    out.append(child)
        elif url not in out and len(out) < MAX_SITEMAPS:
            out.append(url)
    return out[:MAX_SITEMAPS]


# --- blog filter ----------------------------------------------------------------

def _published(lastmod: str) -> str:
    m = re.match(r"(\d{4}-\d{2}-\d{2})", lastmod or "")
    return m.group(1) if m else ""


def blog_pages(entries: list[dict[str, str]], domain: str, path_prefix: str = "") -> list[dict[str, Any]]:
    """Keep the competitor's own article URLs: a blog-like section in the path,
    or a dated page at depth >= 2 whose slug has 3+ hyphenated words. Drops
    pagination, tags, categories, authors, feeds and files. With `path_prefix`
    (a global site's '/sg-en'), only pages under that prefix count."""
    domain = domain.lower()
    prefix = path_prefix.lower().rstrip("/")
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for e in entries:
        url = (e.get("url") or "").strip()
        if not url or domain_of(url) != domain:
            continue
        parsed = urlparse(url)
        path = parsed.path or "/"
        if prefix and not (path.lower() == prefix or path.lower().startswith(prefix + "/")):
            continue
        if DROP_PATH_RE.search(url):
            continue
        segments = [s for s in path.split("/") if s]
        if not segments or any(s.lower() in DROP_SEGMENTS for s in segments):
            continue
        rel = segments[len([s for s in prefix.split("/") if s]):] if prefix else segments
        slug = rel[-1] if rel else ""
        in_blog_section = any(s.lower() in BLOG_SEGMENTS for s in rel[:-1])
        dated_article = bool(_published(e.get("lastmod", ""))) and len(rel) >= 2 and len([w for w in slug.split("-") if w]) >= 3
        if not (in_blog_section or dated_article):
            continue
        key = norm_url(url)
        if key in seen:
            continue
        seen.add(key)
        out.append({"url": url, "lastmod": e.get("lastmod", ""), "published_at": _published(e.get("lastmod", "")), "title": title_from_slug(url), "rel_segments": rel})
        if len(out) >= MAX_PAGES:
            break
    return out


def focus_pages(pages: list[dict[str, Any]], topic_terms: list[str], threshold: int = FOCUS_THRESHOLD, keep_min: int = 20) -> list[dict[str, Any]]:
    """A broad publisher (SingSaver: 2,000 posts on loans, cards and travel) is
    narrowed to the pages whose slug or title names one of the site's topic
    terms. Only applied above `threshold` pages, and only when it leaves at
    least `keep_min`, so a small or off-pattern blog is never emptied."""
    terms = [t.lower().strip() for t in topic_terms if t and t.strip()]
    if len(pages) <= threshold or not terms:
        return pages
    def hit(p: dict[str, Any]) -> bool:
        text = f" {' '.join(re.findall(r'[a-z0-9]+', (urlparse(p.get('url') or '').path + ' ' + (p.get('title') or '')).lower()))} "
        return any(f" {' '.join(re.findall(r'[a-z0-9]+', t))} " in text for t in terms)
    kept = [p for p in pages if hit(p)]
    return kept if len(kept) >= keep_min else pages


def resolve_home(url: str, timeout: float = FETCH_TIMEOUT) -> str:
    """The URL a competitor's homepage finally lands on (libertyinsurance.com.sg
    redirects to libertyinternational.com/sg). Returns the input on any failure."""
    import httpx

    try:
        r = httpx.get(url, follow_redirects=True, timeout=timeout, headers={"User-Agent": "Mozilla/5.0 (compatible; TRS content engine)"})
        return str(r.url) if r.status_code < 400 else url
    except Exception:  # noqa: BLE001
        return url


def effective_home(url: str, domain: str, final_url: str) -> tuple[str, str, str]:
    """(url, domain, prefix) to sweep with, given where the homepage landed. The
    host changes only when it really moved; a redirect that adds a locale path
    (/sg) keeps the domain and gains the prefix."""
    final_domain = domain_of(final_url)
    if not final_domain or final_domain == domain:
        prefix = path_prefix_of(url) or path_prefix_of(final_url)
        return url, domain, prefix
    prefix = path_prefix_of(final_url)
    return f"https://{final_domain}{prefix}", final_domain, prefix


def blog_url_for(pages: list[dict[str, Any]], domain: str, path_prefix: str = "") -> str:
    """https://domain[/prefix]/<most common first segment> among the kept pages."""
    if not pages:
        return ""
    first = Counter(p["rel_segments"][0] for p in pages if len(p.get("rel_segments") or []) >= 2)
    if not first:
        return ""
    segment = first.most_common(1)[0][0]
    prefix = path_prefix.rstrip("/")
    return f"https://{domain}{prefix}/{segment}"


def fetch_titles(pages: list[dict[str, Any]], fetch: Fetch, limit: int = TITLE_FETCHES, workers: int = 8) -> int:
    """Real <title>/og:title for the newest `limit` pages; the rest keep the slug title."""
    newest = sorted(pages, key=lambda p: p.get("lastmod") or "", reverse=True)[:limit]
    if not newest:
        return 0

    def one(p: dict[str, Any]) -> bool:
        try:
            status, html = fetch(p["url"])
        except Exception:  # noqa: BLE001
            return False
        title = parse_title(html) if status == 200 else ""
        if title:
            p["title"] = title
            return True
        return False

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        return sum(1 for ok in pool.map(one, newest) if ok)


# --- prompts --------------------------------------------------------------------

class PromptSuggestion(BaseModel):
    prompt: str = Field("", description="The question as a person types it to an AI assistant.")
    search_query: str = Field("", description="The same need as a Google search, 3 to 7 words.")


class PromptSuggestions(BaseModel):
    prompts: list[PromptSuggestion] = Field(default_factory=list)


class ToneVerdict(BaseModel):
    tone: str = Field("neutral", description="positive | neutral | negative")


def _norm_text(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", re.sub(r"\s+", " ", (text or "").strip().lower())).strip()


def dedupe_prompts(new: list[dict[str, str]], existing: list[str], gsc: dict[str, int], want: int = WANT_PROMPTS) -> list[dict[str, Any]]:
    """Rows ready to insert: new prompts not already in `existing` (case and
    punctuation ignored), at most `want - len(existing)`, with impressions
    when the search query matches a Search Console query exactly."""
    room = max(0, want - len(existing))
    taken = {_norm_text(p) for p in existing}
    out: list[dict[str, Any]] = []
    for s in new:
        prompt = re.sub(r"\s+", " ", (s.get("prompt") or "").strip())
        key = _norm_text(prompt)
        if len(key) < 8 or key in taken or len(out) >= room:
            continue
        taken.add(key)
        query = re.sub(r"\s+", " ", (s.get("search_query") or "").strip()).lower()
        out.append({"prompt": prompt, "search_query": query, "impressions": gsc.get(query) if query in gsc else None, "source": "analysis"})
    return out


PROMPT_SUGGESTER_SYSTEM = """You write the questions a buyer in Singapore types into an AI assistant (ChatGPT, Gemini, Claude) when they need what this business sells. One JSON object: {"prompts": [{"prompt", "search_query"}]}.

Rules:
- Natural first-person questions, 8 to 25 words, the way a business owner or office manager asks. No brand names, no company names, no competitor names.
- Stay inside the topic area given. Spread across buying stages: what it is, do I need it, how much, how to choose, what to check, what goes wrong.
- search_query: the same need as a 3 to 7 word Google search, lowercase, no punctuation.
- Do not repeat or lightly reword any existing prompt.
- Prefer needs the competitor article titles and the Search Console queries show people actually have."""


def suggest_prompts(llm: Any, site: SiteInfo, competitor_titles: list[str], gsc_queries: dict[str, int], existing_prompts: list[str], want: int = WANT_PROMPTS, model: str = "") -> list[dict[str, Any]]:
    """One structured call; returns rows for `insert_prompts` (source analysis)."""
    room = max(0, want - len(existing_prompts))
    if room == 0:
        return []
    top_queries = sorted(gsc_queries.items(), key=lambda kv: -kv[1])[:100]
    user = "\n".join([
        f"Business: {site.business_name} ({site.name}, {site.domain}). Markets: {', '.join(site.markets or ['SG'])}.",
        f"Topic area: {', '.join(site.topic_terms) if site.topic_terms else 'what the site sells'}.",
        f"Produce {room} new prompts.",
        "",
        "Competitor article titles:",
        *[f"- {t}" for t in competitor_titles[:150]],
        "",
        "Search Console queries (query · impressions):",
        *[f"- {q} · {n}" for q, n in top_queries],
        "",
        "Existing prompts (do not repeat):",
        *[f"- {p}" for p in existing_prompts],
    ])
    result, _usage = llm.structured(system=PROMPT_SUGGESTER_SYSTEM, user=user, output=PromptSuggestions, model=model, effort="medium", max_tokens=8000, label="suggest_prompts")
    return dedupe_prompts([s.model_dump() for s in result.prompts], existing_prompts, gsc_queries, want)


# --- grounded Gemini calls --------------------------------------------------------

class RedirectResolver:
    """Grounding chunks point at vertexaisearch redirect URLs. Follow each once
    (HEAD, then GET without reading the body), cache per analysis."""

    def __init__(self, head: Callable[[str], str] | None = None):
        self.head = head or _default_head
        self.cache: dict[str, str] = {}

    def __call__(self, url: str) -> str:
        if GROUNDING_REDIRECT not in url:
            return url
        if url in self.cache:
            return self.cache[url]
        try:
            target = self.head(url) or url
        except Exception:  # noqa: BLE001
            target = url
        self.cache[url] = target
        return target


def _default_head(url: str) -> str:
    import httpx

    for method in ("HEAD", "GET"):
        try:
            with httpx.stream(method, url, follow_redirects=False, timeout=FETCH_TIMEOUT, headers={"User-Agent": "TRS content engine"}) as r:
                location = r.headers.get("location", "")
                if 300 <= r.status_code < 400 and location:
                    return urljoin(url, location)
                if method == "GET":
                    return str(r.url) if str(r.url) != url else ""
        except Exception:  # noqa: BLE001
            continue
    return ""


def grounding_uris(response: Any) -> list[str]:
    """candidates[0].grounding_metadata.grounding_chunks[*].web.uri, deduped, in order."""
    out: list[str] = []
    candidates = getattr(response, "candidates", None) or []
    meta = getattr(candidates[0], "grounding_metadata", None) if candidates else None
    for chunk in getattr(meta, "grounding_chunks", None) or []:
        web = getattr(chunk, "web", None)
        uri = getattr(web, "uri", None) if web is not None else None
        if uri and uri not in out:
            out.append(uri)
    return out


def _usage_tokens(response: Any) -> tuple[int, int]:
    meta = getattr(response, "usage_metadata", None)
    tokens_in = int(getattr(meta, "prompt_token_count", 0) or 0)
    tokens_out = int(getattr(meta, "candidates_token_count", 0) or 0) + int(getattr(meta, "thoughts_token_count", 0) or 0)
    return tokens_in, tokens_out


def grounded(client: Any, model: str, contents: str, system_instruction: str = "", resolve: Callable[[str], str] | None = None) -> dict[str, Any]:
    """One generate_content call with Google Search grounding.
    Returns {text, cited_urls, tokens_in, tokens_out, cost_usd}."""
    from google.genai import types as gtypes

    kwargs: dict[str, Any] = {"tools": [gtypes.Tool(google_search=gtypes.GoogleSearch())], "temperature": 0.2}
    if system_instruction:
        kwargs["system_instruction"] = system_instruction
    response = client.models.generate_content(model=model, contents=contents, config=gtypes.GenerateContentConfig(**kwargs))
    text = ""
    try:
        text = response.text or ""
    except Exception:  # noqa: BLE001 - a response with no text part
        text = ""
    urls: list[str] = []
    for uri in grounding_uris(response):
        real = resolve(uri) if resolve else uri
        if real and real not in urls:
            urls.append(real)
    tokens_in, tokens_out = _usage_tokens(response)
    return {"text": text, "cited_urls": urls, "tokens_in": tokens_in, "tokens_out": tokens_out, "cost_usd": estimate_cost(model, tokens_in, tokens_out)}


def answer_with_search(client: Any, model: str, prompt: str, resolve: Callable[[str], str] | None = None) -> dict[str, Any]:
    """What an AI assistant answers to the prompt, and the pages it cites."""
    return grounded(client, model, prompt, resolve=resolve)


SEARCH_SYSTEM = "You are a search engine. Use Google Search for the query, then list the top 10 results as a numbered list: URL, then the page title. No commentary."


def search_results(client: Any, model: str, query: str, resolve: Callable[[str], str] | None = None) -> dict[str, Any]:
    """Top results for a Google search, read from the grounding chunks (first 10).
    Returns {urls, tokens_in, tokens_out, cost_usd}."""
    r = grounded(client, model, f"Search: {query}", system_instruction=SEARCH_SYSTEM, resolve=resolve)
    return {"urls": r["cited_urls"][:10], "tokens_in": r["tokens_in"], "tokens_out": r["tokens_out"], "cost_usd": r["cost_usd"]}


# --- tone -----------------------------------------------------------------------

def mentioned(site_name: str, site_domain: str, text: str, cited_urls: list[str] | tuple[str, ...] = ()) -> bool:
    hay = (text or "").lower()
    name = (site_name or "").strip().lower()
    domain = (site_domain or "").strip().lower()
    if name and (name in hay or name.replace(" ", "") in hay.replace(" ", "")):
        return True
    if domain and (domain in hay or any(domain_of(u) == domain for u in cited_urls)):
        return True
    return False


TONE_SYSTEM = """Classify how an AI assistant's answer treats one named company. One JSON object {"tone": "positive" | "neutral" | "negative"}.
positive: recommended, listed among good options, or described favourably. neutral: mentioned in passing or as one of many without judgement. negative: warned against, criticised, or described as worse than others."""


def classify_tone(llm: Any, site_name: str, site_domain: str, answer_text: str, cited_urls: list[str] | tuple[str, ...] = (), model: str = "") -> str:
    """'not_mentioned' is decided in code; the model only judges tone when the
    name or domain appears in the answer or its citations."""
    if not mentioned(site_name, site_domain, answer_text, cited_urls):
        return "not_mentioned"
    if llm is None:
        return "neutral"
    user = f"Company: {site_name} ({site_domain}).\n\nAnswer:\n{(answer_text or '')[:6000]}\n\nCited URLs:\n" + "\n".join(cited_urls[:20])
    try:
        verdict, _usage = llm.structured(system=TONE_SYSTEM, user=user, output=ToneVerdict, model=model, effort="low", max_tokens=200, label="classify_tone")
    except Exception as e:  # noqa: BLE001 - tone is a label, not a reason to fail the prompt
        log.warning("tone classification failed: %s", str(e)[:200])
        return "neutral"
    tone = (verdict.tone or "").strip().lower()
    return tone if tone in ("positive", "neutral", "negative") else "neutral"


# --- scoring --------------------------------------------------------------------

def score(competitors: list[dict[str, Any]], pages: list[dict[str, Any]], results: list[dict[str, Any]], site_domain: str = "") -> dict[str, Any]:
    """competitors: [{id, domain}], pages: [{competitor_id, url, published_at}],
    results: [{cited_domains, cited_urls, search_urls}].
    Returns {competitors: {id: {cited_count, search_hits, best_page_url, best_page_note}},
             pages: {url: {cited, search}}, site: {cited, top10}}."""
    cited_by_url: Counter[str] = Counter()
    search_by_url: Counter[str] = Counter()
    cited_by_domain: Counter[str] = Counter()
    search_by_domain: Counter[str] = Counter()
    site_cited = site_top10 = 0
    for r in results:
        cited_urls = list(r.get("cited_urls") or [])
        search_urls = list(r.get("search_urls") or [])
        cited_domains = {d.lower() for d in (r.get("cited_domains") or [])} | {domain_of(u) for u in cited_urls}
        search_domains = {domain_of(u) for u in search_urls}
        cited_domains.discard("")
        search_domains.discard("")
        for key in {norm_url(u) for u in cited_urls}:
            cited_by_url[key] += 1
        for key in {norm_url(u) for u in search_urls}:
            search_by_url[key] += 1
        for d in cited_domains:
            cited_by_domain[d] += 1
        for d in search_domains:
            search_by_domain[d] += 1
        if site_domain:
            site_cited += int(site_domain.lower() in cited_domains or bool(r.get("us_cited")))
            site_top10 += int(site_domain.lower() in search_domains)

    page_counts: dict[str, dict[str, int]] = {}
    by_competitor: dict[str, list[dict[str, Any]]] = {}
    for p in pages:
        key = norm_url(p["url"])
        counts = {"cited": cited_by_url.get(key, 0), "search": search_by_url.get(key, 0)}
        page_counts[p["url"]] = counts
        by_competitor.setdefault(str(p.get("competitor_id")), []).append({**p, **counts})

    out_competitors: dict[str, dict[str, Any]] = {}
    for c in competitors:
        domain = (c.get("domain") or "").lower()
        own = by_competitor.get(str(c["id"]), [])
        best = max(own, key=lambda p: (p["cited"], p["search"], p.get("published_at") or "")) if own else None
        out_competitors[str(c["id"])] = {
            "cited_count": cited_by_domain.get(domain, 0),
            "search_hits": search_by_domain.get(domain, 0),
            "best_page_url": best["url"] if best else None,
            "best_page_note": f"cited in {best['cited']} answers · top 10 for {best['search']} searches" if best else None,
        }
    return {"competitors": out_competitors, "pages": page_counts, "site": {"cited": site_cited, "top10": site_top10}}


# --- the run ----------------------------------------------------------------------

class _Meter:
    """Wraps the LLM so every structured call's cost lands in one total."""

    def __init__(self, llm: Any):
        self.llm = llm
        self.cost_usd = 0.0
        self.calls = 0

    def structured(self, **kwargs: Any) -> tuple[Any, Any]:
        result, usage = self.llm.structured(**kwargs)
        self.cost_usd += float(getattr(usage, "cost_usd", 0) or 0)
        self.calls += 1
        return result, usage


def default_fetch(url: str, timeout: float = FETCH_TIMEOUT) -> tuple[int, str]:
    import httpx

    try:
        r = httpx.get(url, follow_redirects=True, timeout=timeout, headers={"User-Agent": "Mozilla/5.0 (compatible; TRS content engine)"})
        return r.status_code, r.text
    except Exception:  # noqa: BLE001
        return 0, ""


def analysis_llm(settings: Settings) -> LLM:
    """The engine's LLM wrapper with Gemini first and the analysis model, so
    prompt suggestions and tone are one Gemini JSON call each."""
    order = ["gemini"] + [p for p in settings.provider_order if p != "gemini"]
    return LLM(replace(settings, gemini_model=settings.analysis_model, provider_order=order))


def gemini_client(settings: Settings) -> Any:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is required for competitor analysis")
    from google import genai

    return genai.Client(api_key=settings.gemini_api_key)


def _sweep_competitor(store: Store, site: SiteInfo, c: dict[str, Any], fetch: Fetch, resolve: Callable[[str], str] = resolve_home) -> list[dict[str, Any]]:
    home = c.get("url") or f"https://{c['domain']}"
    url, domain, prefix = effective_home(home, c["domain"], resolve(home))
    fields: dict[str, Any] = {"last_analysed_at": _now()}
    if domain != c["domain"]:
        # The site moved host. Record it so citations match; the unique (site, domain) key may
        # refuse when the new host is already listed, in which case the sweep still uses it.
        try:
            store.update_competitor(c["id"], url=url, domain=domain)
        except Exception as e:  # noqa: BLE001
            log.warning("competitor %s kept domain %s: %s", c["id"], c["domain"], str(e)[:120])
    sitemaps = discover_sitemaps(url, fetch)
    entries: list[dict[str, str]] = []
    for sm in sitemaps:
        status, body = fetch(sm)
        if status == 200 and body:
            entries += parse_sitemap(body)
    pages = blog_pages(entries, domain, prefix)
    fetch_titles(pages, fetch)
    pages = focus_pages(pages, list(site.topic_terms or []))
    store.upsert_pages(c["id"], site.id, pages)
    fields["pages_count"] = len(pages)
    blog_url = blog_url_for(pages, domain, prefix)
    if blog_url:
        fields["blog_url"] = blog_url
    if sitemaps:
        fields["sitemap_url"] = sitemaps[0]
    if is_auto_name(c.get("name") or "", c["domain"]):
        status, html = fetch(url)
        title = clean_site_title(parse_title(html)) if status == 200 else ""
        if title:
            fields["name"] = title
    store.update_competitor(c["id"], **fields)
    return [{"competitor_id": c["id"], **p} for p in pages]


def run_analysis(settings: Settings, store: Store, analysis_id: str, *, fetch: Fetch | None = None, client: Any = None, llm: Any = None, resolve: Callable[[str], str] | None = None, home: Callable[[str], str] | None = None) -> dict[str, Any] | None:
    """The whole analysis for one geo_analyses row. Never raises: any failure
    marks the row failed with the error text; per-prompt failures go to
    summary.errors and the run completes."""
    analysis = store.get_analysis(analysis_id)
    if analysis is None:
        log.warning("analysis %s not found", analysis_id)
        return None
    fetch = fetch or default_fetch
    resolve = resolve or RedirectResolver()
    model = settings.analysis_model
    summary: dict[str, Any] = {"competitors": {}, "errors": [], "site": {}, "model": model}
    cost = 0.0
    store.update_analysis(analysis_id, status="running", started_at=analysis.get("started_at") or _now(), model=model)
    try:
        site = store.site_info(analysis["site_id"])
        meter = _Meter(llm or analysis_llm(settings))
        client = client or gemini_client(settings)

        # 1. competitors' blogs
        competitors = store.list_competitors(site.id)
        all_pages: list[dict[str, Any]] = []
        for c in competitors:
            try:
                pages = _sweep_competitor(store, site, c, fetch, home or resolve_home)
                all_pages += pages
                summary["competitors"][c["domain"]] = {"pages": len(pages)}
            except Exception as e:  # noqa: BLE001
                summary["errors"].append(f"{c.get('domain')}: {str(e)[:200]}")
        pages_read = len(all_pages)

        # 2. prompts
        existing = store.list_prompts(site.id)
        if len(existing) < WANT_PROMPTS:
            try:
                titles = [p["title"] for p in sorted(all_pages, key=lambda p: p.get("lastmod") or "", reverse=True) if p.get("title")]
                rows = suggest_prompts(meter, site, titles, store.gsc_impressions(site.id), [p["prompt"] for p in existing], WANT_PROMPTS, model=model)
                added = store.insert_prompts(site.id, rows) if rows else 0
                summary["prompts_suggested"] = added
                existing = store.list_prompts(site.id)
            except Exception as e:  # noqa: BLE001
                summary["errors"].append(f"suggest_prompts: {str(e)[:200]}")
        prompts = existing[: settings.analysis_max_prompts]

        # 3. answers, tone, search results
        results: list[dict[str, Any]] = []
        for p in prompts:
            try:
                answer = answer_with_search(client, model, p["prompt"], resolve)
                cost += answer["cost_usd"]
                cited_urls = answer["cited_urls"]
                cited_domains = []
                for u in cited_urls:
                    d = domain_of(u)
                    if d and d not in cited_domains:
                        cited_domains.append(d)
                tone = classify_tone(meter, site.name, site.domain, answer["text"], cited_urls, model=model)
                search = search_results(client, model, (p.get("search_query") or "").strip() or p["prompt"], resolve)
                cost += search["cost_usd"]
                results.append({
                    "site_id": site.id, "prompt_id": p["id"], "cited_domains": cited_domains, "cited_urls": cited_urls, "search_urls": search["urls"],
                    "us_cited": site.domain.lower() in cited_domains, "tone": tone, "answer_excerpt": (answer["text"] or "")[:2000],
                })
            except Exception as e:  # noqa: BLE001
                summary["errors"].append(f"prompt {p.get('id')}: {str(e)[:200]}")
        store.replace_results(analysis_id, results)

        # 4. scores
        sc = score(competitors, all_pages, results, site.domain)
        store.reset_page_counts(site.id)
        store.bump_page_counts(site.id, sc["pages"])
        for cid, fields in sc["competitors"].items():
            store.update_competitor(cid, **fields)
            domain = next((c["domain"] for c in competitors if str(c["id"]) == cid), cid)
            summary["competitors"].setdefault(domain, {}).update(fields)
        try:
            own_pages = store.published_count(site.id)
        except Exception:  # noqa: BLE001
            own_pages = 0
        summary["site"] = {"pages": own_pages, **sc["site"]}
        cost += meter.cost_usd
        summary["llm_calls"] = meter.calls
        store.update_analysis(
            analysis_id, status="completed", pages_read=pages_read, prompts_checked=len(results), cited_count=sc["site"]["cited"],
            cost_usd=round(cost, 6), model=model, summary=summary, completed_at=_now(),
        )
        return store.get_analysis(analysis_id)
    except Exception as e:  # noqa: BLE001
        log.exception("analysis %s failed", analysis_id)
        store.update_analysis(analysis_id, status="failed", error=str(e)[:500], summary=summary, cost_usd=round(cost, 6), completed_at=_now())
        return store.get_analysis(analysis_id)
