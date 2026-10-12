"""Nightly batch: for every site with nightly_count > 0, create that many
runs. Search Console targets first (searches the site already appears for,
on pages 2 to 5); the product and case-study rotation fills any slot the
data cannot. Called by Cloud Scheduler via POST /nightly, or
`python -m engine.cli nightly`.
"""
from __future__ import annotations

from datetime import date

from .config import Settings
from .models import Focus, RunSetup
from .pipeline import start_run
from .search_targets import TargetRules, pick_targets
from .store.base import RunRecord, SiteInfo, Store


def _rules(site: SiteInfo) -> TargetRules:
    return TargetRules(
        topic_terms=site.topic_terms,
        pillar_terms=[p.get("title", "") for p in site.pillar_pages],
        brand_terms=site.brand_terms or [site.name, site.domain.split(".")[0]],
        blog_base_path=site.blog_base_path,
    )


def plan_nightly(store: Store, site: SiteInfo, count: int, day: date | None = None) -> list[RunSetup]:
    day = day or date.today()
    try:
        targets, _refresh = pick_targets(store.search_queries(site.id), store.recent_target_queries(site.id), count, _rules(site))
    except Exception:  # noqa: BLE001 - never let the data source stop the night's run
        targets = []
    markets = site.markets or ["SG"]
    setups: list[RunSetup] = [
        RunSetup(
            engine="python",
            site_id=site.id,
            focus=Focus(type="question", id="", label=t.query),
            market=t.market if t.market in markets else markets[0],
            topic=t.query,
            reader_question=t.query,
            target_query=t.query,
            target_position=t.position,
            objective="rank on page one for this search and bring in enquiries",
        )
        for t in targets
    ]
    if len(setups) >= count:
        return setups[:count]
    setups += _rotation(store, site, count - len(setups), day)
    return setups


def _rotation(store: Store, site: SiteInfo, count: int, day: date) -> list[RunSetup]:
    entries = store.load_knowledge(site.id)
    products = sorted([e for e in entries if e.section == "product"], key=lambda e: (-e.priority, e.title))
    cases = sorted([e for e in entries if e.section == "case_study"], key=lambda e: (-e.priority, e.title))
    markets = site.markets or ["SG"]
    # The home market (first listed) takes every other slot; the rest share the remainder.
    rotation = [m for pair in zip(markets, [markets[0]] * len(markets)) for m in pair] or ["SG"]
    # count + 1 so consecutive nights never land on the same products and markets.
    seed = day.toordinal() * (max(1, count) + 1)
    setups: list[RunSetup] = []
    for i in range(count):
        n = seed + i
        market = rotation[n % len(rotation)]
        # Three in four articles focus a product; every fourth shows a case study.
        if cases and (n % 4 == 3):
            e = cases[n // 4 % len(cases)]
            focus = Focus(type="case_study", id=e.id, label=e.title)
        elif products:
            e = products[n % len(products)]
            focus = Focus(type="product", id=e.id, label=e.title)
        else:
            focus = Focus(type="market", id="", label=market)
        setups.append(RunSetup(engine="python", site_id=site.id, focus=focus, market=market, objective="bring in enquiries for the business"))
    return setups


def create_nightly_runs(settings: Settings, store: Store, site_id: str = "", count: int | None = None) -> list[RunRecord]:
    """One batch per site. `site_id` narrows to one site; `count` overrides
    every site's own nightly_count (capped by ENGINE_NIGHTLY_MAX)."""
    out: list[RunRecord] = []
    for site in store.list_sites():
        if site_id and site.id != site_id:
            continue
        wanted = site.nightly_count if count is None else count
        wanted = max(0, min(wanted, settings.nightly_max))
        if wanted == 0:
            continue
        out += [start_run(settings, store, setup, triggered_by="scheduled") for setup in plan_nightly(store, site, wanted)]
    return out
