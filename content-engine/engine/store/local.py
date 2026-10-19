"""In-memory store, optionally mirrored to a directory as JSON/Markdown.
Used by tests and by the CLI's --no-db mode."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from ..models import Article, KnowledgeEntry, RunSetup
from .base import NodeUpdate, RunRecord, SiteInfo


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_site() -> SiteInfo:
    return SiteInfo(
        id="site-1", key="corpcover", name="Corp Cover", domain="corpcover.com", base_url="https://corpcover.com",
        blog_base_path="/articles", contact_url="https://corpcover.com/#start", business_name="Trade Risk Solutions Pte Ltd",
        markets=["SG"], brand_terms=["corp cover", "corpcover"], pillar_pages=[{"url": "https://corpcover.com/articles", "title": "Business insurance guides"}],
    )


class LocalStore:
    def __init__(self, out_dir: str | Path | None = None, knowledge: list[KnowledgeEntry] | None = None, published: list[dict[str, str]] | None = None, site: SiteInfo | None = None):
        self.out_dir = Path(out_dir) if out_dir else None
        self.knowledge = knowledge or []
        self.site = site or default_site()
        self.runs: dict[str, RunRecord] = {}
        self.nodes: dict[str, dict[str, dict[str, Any]]] = {}
        self.events: dict[str, list[dict[str, Any]]] = {}
        self.sources: dict[str, list[dict[str, Any]]] = {}
        self.articles: dict[str, dict[str, Any]] = {}
        self.spend: float = 0.0
        self._published = published or []
        self._queries: list[dict[str, Any]] = []
        self.overrides: dict[str, str] = {}
        # marketing v2: prompts, competitors, analyses (all keyed by id)
        self.prompts: dict[str, dict[str, Any]] = {}
        self.competitors: dict[str, dict[str, Any]] = {}
        self.pages: dict[tuple[str, str], dict[str, Any]] = {}  # (competitor_id, url)
        self.analyses: dict[str, dict[str, Any]] = {}
        self.results: dict[str, list[dict[str, Any]]] = {}
        self.gsc: dict[str, int] = {}

    # runs
    def create_run(self, site_id: str, setup: RunSetup, node_defs: list[tuple[str, str, str]], triggered_by: str = "manual") -> RunRecord:
        setup.site_id = site_id
        run = RunRecord(id=str(uuid.uuid4()), site_id=site_id, status="queued", setup=setup, triggered_by=triggered_by)
        self.runs[run.id] = run
        self.ensure_nodes(run, node_defs)
        return run

    def get_run(self, run_id: str) -> RunRecord | None:
        return self.runs.get(run_id)

    def claim_queued_runs(self, limit: int = 1) -> list[RunRecord]:
        out = []
        for run in self.runs.values():
            if run.status == "queued" and len(out) < limit:
                run.status = "running"
                out.append(run)
        return out

    def list_stale_running_runs(self, older_than_minutes: int) -> list[RunRecord]:
        return []

    def update_run(self, run_id: str, **fields: Any) -> None:
        run = self.runs[run_id]
        for k, v in fields.items():
            if hasattr(run, k):
                setattr(run, k, v)
        self._mirror(run_id)

    def save_state(self, run_id: str, state: dict[str, Any]) -> None:
        self.runs[run_id].state = state
        self._mirror(run_id)

    def run_status(self, run_id: str) -> str:
        return self.runs[run_id].status

    # nodes / events / sources
    def ensure_nodes(self, run: RunRecord, node_defs: list[tuple[str, str, str]]) -> None:
        self.nodes.setdefault(run.id, {})
        for i, (key, label, typ) in enumerate(node_defs):
            self.nodes[run.id].setdefault(key, {"node_key": key, "label": label, "type": typ, "status": "queued", "sort_order": i})

    def update_node(self, run_id: str, update: NodeUpdate) -> None:
        node = self.nodes.setdefault(run_id, {}).setdefault(update.node_key, {"node_key": update.node_key})
        for k, v in vars(update).items():
            if k == "node_key" or v in ("", None, -1):
                continue
            node[k] = v

    def add_event(self, run: RunRecord, level: str, message: str, node_key: str = "", metadata: dict[str, Any] | None = None) -> None:
        self.events.setdefault(run.id, []).append({"level": level, "message": message, "node_key": node_key, "metadata": metadata or {}, "created_at": _now()})

    def add_sources(self, run: RunRecord, entries: list[KnowledgeEntry], scores: dict[str, float]) -> None:
        self.sources[run.id] = [{"doc_id": e.id, "title": e.title, "section": e.section, "score": scores.get(e.id), "used_in": [], "citation_status": "unsupported"} for e in entries]

    def mark_sources_used(self, run_id: str, entry_to_facts: dict[str, list[str]]) -> None:
        for s in self.sources.get(run_id, []):
            facts = entry_to_facts.get(s["doc_id"], [])
            s["used_in"] = facts
            s["citation_status"] = "supported" if facts else "unsupported"

    # sites, knowledge & context
    def list_sites(self) -> list[SiteInfo]:
        return [self.site]

    def site_info(self, site_id: str) -> SiteInfo:
        return self.site

    def load_knowledge(self, site_id: str) -> list[KnowledgeEntry]:
        return list(self.knowledge)

    def prompt_overrides(self, site_id: str, pipeline: str = "engine") -> dict[str, str]:
        return dict(self.overrides)

    def published_articles(self, site: SiteInfo) -> list[dict[str, str]]:
        return list(self._published)

    def search_queries(self, site_id: str) -> list[dict[str, Any]]:
        return list(self._queries)

    def recent_target_queries(self, site_id: str, days: int = 90) -> set[str]:
        return {str(r.setup.target_query).lower() for r in self.runs.values() if r.setup.target_query}

    def unique_slug(self, site_id: str, slug: str) -> str:
        taken = {a["slug"] for a in self.articles.values()}
        if slug not in taken:
            return slug
        i = 2
        while f"{slug}-{i}" in taken:
            i += 1
        return f"{slug}-{i}"

    def published_count(self, site_id: str) -> int:
        return len(self._published) + sum(1 for a in self.articles.values() if a["status"] == "published")

    # prompts
    def add_prompt(self, prompt: str, search_query: str = "", impressions: int | None = None, selected: bool = False, source: str = "manual", archived: bool = False) -> dict[str, Any]:
        row = {"id": str(uuid.uuid4()), "site_id": self.site.id, "prompt": prompt, "search_query": search_query, "impressions": impressions,
               "source": source, "selected": selected, "archived": archived, "created_at": _now()}
        self.prompts[row["id"]] = row
        return row

    def selected_prompts(self, site_id: str) -> list[dict[str, Any]]:
        return [{"id": p["id"], "prompt": p["prompt"], "search_query": p["search_query"], "impressions": p["impressions"]}
                for p in self.prompts.values() if p["selected"] and not p["archived"]]

    def prompts_with_articles(self, site_id: str, days: int = 90) -> set[str]:
        return {r.setup.prompt_id for r in self.runs.values() if r.setup.prompt_id and (r.article_id or r.status in ("queued", "running"))}

    def list_prompts(self, site_id: str) -> list[dict[str, Any]]:
        return [dict(p) for p in self.prompts.values() if not p["archived"]]

    def insert_prompts(self, site_id: str, rows: list[dict[str, Any]]) -> int:
        taken = {p["prompt"].strip().lower() for p in self.prompts.values()}
        n = 0
        for r in rows:
            prompt = (r.get("prompt") or "").strip()
            if not prompt or prompt.lower() in taken:
                continue
            taken.add(prompt.lower())
            self.add_prompt(prompt, r.get("search_query") or "", r.get("impressions"), source=r.get("source") or "analysis")
            n += 1
        return n

    def gsc_impressions(self, site_id: str) -> dict[str, int]:
        return dict(self.gsc)

    # competitors
    def add_competitor(self, url: str, domain: str, name: str = "", path_prefix: str = "") -> dict[str, Any]:
        row = {"id": str(uuid.uuid4()), "site_id": self.site.id, "name": name or domain.split(".")[0].capitalize(), "url": url, "domain": domain,
               "blog_url": None, "sitemap_url": None, "status": "active", "pages_count": 0, "best_page_url": None, "best_page_note": None,
               "cited_count": 0, "search_hits": 0, "last_analysed_at": None, "created_at": _now()}
        self.competitors[row["id"]] = row
        return row

    def list_competitors(self, site_id: str) -> list[dict[str, Any]]:
        return [dict(c) for c in self.competitors.values() if c["status"] == "active"]

    def update_competitor(self, competitor_id: str, **fields: Any) -> None:
        self.competitors[competitor_id].update(fields)

    def upsert_pages(self, competitor_id: str, site_id: str, pages: list[dict[str, Any]]) -> None:
        for p in pages:
            key = (competitor_id, p["url"])
            row = self.pages.setdefault(key, {"competitor_id": competitor_id, "site_id": site_id, "url": p["url"], "cited_count": 0, "search_hits": 0})
            row.update({"title": p.get("title"), "published_at": p.get("published_at"), "last_seen_at": _now()})

    def reset_page_counts(self, site_id: str) -> None:
        for row in self.pages.values():
            row["cited_count"] = 0
            row["search_hits"] = 0

    def bump_page_counts(self, site_id: str, counts: dict[str, dict[str, int]]) -> None:
        for row in self.pages.values():
            c = counts.get(row["url"])
            if c:
                row["cited_count"] = int(c.get("cited") or 0)
                row["search_hits"] = int(c.get("search") or 0)

    # analyses
    def add_analysis(self, status: str = "queued", created_at: str = "") -> dict[str, Any]:
        version = 1 + max((a["version"] for a in self.analyses.values()), default=0)
        row = {"id": str(uuid.uuid4()), "site_id": self.site.id, "version": version, "status": status, "pages_read": 0, "prompts_checked": 0,
               "cited_count": 0, "cost_usd": 0, "model": None, "summary": {}, "error": None, "started_at": None, "completed_at": None, "created_at": created_at or _now()}
        self.analyses[row["id"]] = row
        return row

    def get_analysis(self, analysis_id: str) -> dict[str, Any] | None:
        row = self.analyses.get(analysis_id)
        return dict(row) if row else None

    def update_analysis(self, analysis_id: str, **fields: Any) -> None:
        self.analyses[analysis_id].update(fields)

    def list_stale_running_analyses(self, older_than_minutes: int) -> list[dict[str, Any]]:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=older_than_minutes)
        out = []
        for row in self.analyses.values():
            started = row.get("started_at")
            if row.get("status") != "running" or not started:
                continue
            ts = datetime.fromisoformat(started) if isinstance(started, str) else started
            if ts < cutoff:
                out.append(row)
        return out

    def claim_queued_analyses(self, limit: int = 1, older_than_seconds: int = 0) -> list[dict[str, Any]]:
        cutoff = datetime.now(timezone.utc).timestamp() - older_than_seconds
        out = []
        for row in self.analyses.values():
            if row["status"] != "queued" or len(out) >= limit:
                continue
            if older_than_seconds and datetime.fromisoformat(row["created_at"]).timestamp() > cutoff:
                continue
            row["status"] = "running"
            row["started_at"] = _now()
            out.append(dict(row))
        return out

    def replace_results(self, analysis_id: str, rows: list[dict[str, Any]]) -> None:
        self.results[analysis_id] = [dict(r) for r in rows]

    # output
    def save_article(self, run: RunRecord, article: Article, status: str, category: str, topic: str = "") -> str:
        article_id = str(uuid.uuid4())
        self.articles[article_id] = {"id": article_id, "slug": article.slug, "status": status, "title": article.title, "topic": topic, "article": article.model_dump()}
        if self.out_dir:
            self.out_dir.mkdir(parents=True, exist_ok=True)
            (self.out_dir / f"{article.slug}.md").write_text(f"# {article.title}\n\n{article.markdown}", encoding="utf-8")
            (self.out_dir / f"{article.slug}.html").write_text(article.html, encoding="utf-8")
            (self.out_dir / f"{article.slug}.json").write_text(json.dumps(article.model_dump(), indent=2, ensure_ascii=False), encoding="utf-8")
        return article_id

    def record_spend(self, site_id: str, cost_usd: float, article_id: str = "", source: str = "manual") -> None:
        self.spend += cost_usd
        self.spend_source = source

    # helpers
    def _mirror(self, run_id: str) -> None:
        if not self.out_dir:
            return
        self.out_dir.mkdir(parents=True, exist_ok=True)
        run = self.runs[run_id]
        payload = {
            "run": {"id": run.id, "status": run.status, "error": run.error, "setup": run.setup.model_dump(), "article_id": run.article_id},
            "state": run.state,
            "nodes": list(self.nodes.get(run_id, {}).values()),
            "events": self.events.get(run_id, []),
            "sources": self.sources.get(run_id, []),
        }
        (self.out_dir / f"run-{run_id}.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
