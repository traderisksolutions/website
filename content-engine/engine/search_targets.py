"""Choose what the nightly engine writes from Search Console, not from guesses.

Average Google position is impression-weighted, so it improves when the
site shows up on page one for the searches it already appears for, and gets
worse when new articles chase broad terms and surface at positions 40 to 90.

So a target is a search where Google already shows the site, but not well
enough:

  - best position between 8 and 50 (close enough to move, not hopeless)
  - at least 2 impressions in the window (someone actually searches it)
  - on-topic for what the site sells (rules.topic_terms; empty = no filter)
  - not a brand search, and not a head term a service page owns (a blog
    post competing for "business insurance singapore" splits that page)
  - no existing article already dedicated to it (that one needs a refresh,
    and a second article would compete with it)
  - not a short search (three words or fewer) sitting below position 30
  - not targeted by a run in the last 90 days

Ranked by impressions, then by how close the position is to page one.
The terms come from the site's marketing_sites row, so each website gets
its own rules.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

MIN_POSITION = 8.0
MAX_POSITION = 50.0
MIN_IMPRESSIONS = 2
BROAD_MAX_POSITION = 30.0

MARKET_HINTS = [("indonesia", "ID"), ("jakarta", "ID"), ("malaysia", "MY"), ("kuala lumpur", "MY"), ("hong kong", "HK")]


@dataclass
class TargetRules:
    topic_terms: list[str] = field(default_factory=list)   # a search must contain one; empty = accept all
    pillar_terms: list[str] = field(default_factory=list)  # head terms the service pages own
    brand_terms: list[str] = field(default_factory=list)
    blog_base_path: str = "/blog"


@dataclass
class SearchTarget:
    query: str
    impressions: int
    position: float
    page: str
    market: str


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _has_term(query: str, terms: list[str]) -> bool:
    q = f" {' '.join(re.findall(r'[a-z0-9]+', query.lower()))} "
    return any(f" {' '.join(re.findall(r'[a-z0-9]+', t.lower()))} " in q for t in terms if t.strip())


def _dedicated_article(query: str, page: str, blog_base_path: str) -> bool:
    """True when the ranking page is a blog article whose slug already covers
    most of the query's words: that article should be refreshed, not joined
    by a second one."""
    # "/:market/articles" matches any market folder, e.g. /sg/articles/.
    pattern = re.escape(blog_base_path.rstrip("/") + "/").replace(re.escape(":market"), "[a-z]{2}")
    if not re.search(pattern, page):
        return False
    q = {w for w in _words(query) if len(w) > 2} - {"the", "and", "for", "how", "what", "with"}
    if not q:
        return False
    slug = _words(page.split(marker, 1)[1])
    return len(q & slug) / len(q) >= 0.6


def market_for(query: str, default: str = "SG") -> str:
    q = query.lower()
    for hint, code in MARKET_HINTS:
        if hint in q:
            return code
    return default


def pick_targets(rows: list[dict], already_targeted: set[str], limit: int, rules: TargetRules | None = None) -> tuple[list[SearchTarget], list[SearchTarget]]:
    """Returns (write, refresh). rows are gsc_query_pages records with query,
    page, impressions, position. write: searches to give a new article.
    refresh: searches an existing article should be strengthened for."""
    rules = rules or TargetRules()
    by_query: dict[str, dict] = {}
    for r in rows:
        q = (r.get("query") or "").strip().lower()
        if not q:
            continue
        cur = by_query.setdefault(q, {"impressions": 0, "best": None})
        cur["impressions"] += int(r.get("impressions") or 0)
        pos = float(r.get("position") or 999)
        if cur["best"] is None or pos < cur["best"][0]:
            cur["best"] = (pos, r.get("page") or "")

    pillars = {p.strip().lower() for p in rules.pillar_terms if p.strip()}
    write: list[SearchTarget] = []
    refresh: list[SearchTarget] = []
    for q, v in by_query.items():
        pos, page = v["best"]
        if v["impressions"] < MIN_IMPRESSIONS or not (MIN_POSITION <= pos <= MAX_POSITION):
            continue
        if _has_term(q, rules.brand_terms) or q in pillars:
            continue
        if rules.topic_terms and not _has_term(q, rules.topic_terms):
            continue
        if q in already_targeted:
            continue
        # Short and far down: a broad search a small site rarely climbs.
        if len(re.findall(r"[a-z0-9]+", q)) <= 3 and pos > BROAD_MAX_POSITION:
            continue
        t = SearchTarget(query=q, impressions=v["impressions"], position=round(pos, 1), page=page, market=market_for(q))
        (refresh if _dedicated_article(q, page, rules.blog_base_path) else write).append(t)

    # More searches first; among equals, the one closest to page one.
    key = lambda t: (-t.impressions, t.position)  # noqa: E731
    return sorted(write, key=key)[:limit], sorted(refresh, key=key)
