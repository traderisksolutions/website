"""PostgREST store. Writes the same tables the TRS dashboard renders:
blog_generation_runs / nodes / events / sources and cms_articles, all keyed
by site_id (marketing_sites). Knowledge comes from knowledge_entries.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import create_client

from ..models import Article, KnowledgeEntry, RunSetup
from .base import NodeUpdate, RunRecord, SiteInfo


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _site_from_row(row: dict[str, Any]) -> SiteInfo:
    pages = row.get("pillar_pages") or []
    return SiteInfo(
        id=row["id"], key=row["key"], name=row["name"], domain=row["domain"], base_url=row["base_url"],
        blog_base_path=row.get("blog_base_path") or "/blog", contact_url=row.get("contact_url") or "",
        business_name=row.get("business_name") or row["name"],
        markets=list(row.get("markets") or ["SG"]), brand_terms=list(row.get("brand_terms") or []),
        topic_terms=list(row.get("topic_terms") or []),
        pillar_pages=[p for p in pages if isinstance(p, dict) and p.get("url")],
        banned_terms=list(row.get("banned_terms") or []),
        require_approval=bool(row.get("require_approval", True)), nightly_count=int(row.get("nightly_count") or 0),
        article_length=str(row.get("article_length") or "standard"),
    )


def _chunks(rows: list[dict[str, Any]], size: int = 500):
    for i in range(0, len(rows), size):
        yield rows[i:i + size]


class SupabaseStore:
    def __init__(self, url: str, service_key: str, api_prefix: str | None = None):
        # trs-api serves PostgREST at /rest/v1 (Caddy strips it), which is the
        # supabase-py default. SUPABASE_API_PREFIX="" talks to bare PostgREST.
        if api_prefix is not None:
            from postgrest import SyncPostgrestClient

            rest = SyncPostgrestClient(f"{url.rstrip('/')}{api_prefix}", headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"}, schema="public", timeout=60)

            class _RestShim:
                def table(self, name: str):  # noqa: ANN202 - mirrors supabase-py
                    return rest.from_(name)

            self.sb = _RestShim()  # type: ignore[assignment]
        else:
            self.sb = create_client(url, service_key)

    # --- runs -------------------------------------------------------------

    def create_run(self, site_id: str, setup: RunSetup, node_defs: list[tuple[str, str, str]], triggered_by: str = "manual") -> RunRecord:
        setup.site_id = site_id
        row = {
            "site_id": site_id,
            "status": "queued",
            "setup": setup.model_dump(),
            "targets": [],
            "primary_target_id": setup.focus.id or None,
            "primary_target_type": setup.focus.type if setup.focus.id else None,
            "primary_target_name": setup.focus.label or None,
            "triggered_by": triggered_by,
        }
        if setup.prompt_id:
            row["prompt_id"] = setup.prompt_id
        try:
            data = self.sb.table("blog_generation_runs").insert(row).execute().data
        except Exception as e:  # noqa: BLE001 - migration 20261019 not applied yet
            if "prompt_id" not in row or "prompt_id" not in str(e):
                raise
            row.pop("prompt_id")
            data = self.sb.table("blog_generation_runs").insert(row).execute().data
        run = RunRecord(id=data[0]["id"], site_id=site_id, status="queued", setup=setup, triggered_by=triggered_by)
        self.ensure_nodes(run, node_defs)
        return run

    def _to_record(self, row: dict[str, Any]) -> RunRecord:
        setup_raw = row.get("setup") or {}
        try:
            setup = RunSetup.model_validate(setup_raw)
        except Exception:  # noqa: BLE001 - a non-engine run
            setup = RunSetup(engine=str(setup_raw.get("engine", "manual")))
        setup.site_id = setup.site_id or row["site_id"]
        plan = row.get("content_plan") or {}
        state = plan.get("engine_state", {}) if isinstance(plan, dict) else {}
        return RunRecord(
            id=row["id"], site_id=row["site_id"], status=row["status"], setup=setup, state=state,
            article_id=row.get("article_id") or "", error=row.get("error") or "", triggered_by=row.get("triggered_by") or "manual",
        )

    def get_run(self, run_id: str) -> RunRecord | None:
        data = self.sb.table("blog_generation_runs").select("*").eq("id", run_id).limit(1).execute().data
        return self._to_record(data[0]) if data else None

    def claim_queued_runs(self, limit: int = 1) -> list[RunRecord]:
        rows = (
            self.sb.table("blog_generation_runs").select("*").eq("status", "queued")
            .eq("setup->>engine", "python").order("created_at").limit(limit).execute().data
        )
        claimed: list[RunRecord] = []
        for row in rows:
            updated = (
                self.sb.table("blog_generation_runs").update({"status": "running", "started_at": _now()})
                .eq("id", row["id"]).eq("status", "queued").execute().data
            )
            if updated:
                rec = self._to_record(row)
                rec.status = "running"
                claimed.append(rec)
        return claimed

    def list_stale_running_runs(self, older_than_minutes: int) -> list[RunRecord]:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=older_than_minutes)).isoformat()
        rows = (
            self.sb.table("blog_generation_runs").select("*").eq("status", "running").eq("setup->>engine", "python")
            .lt("started_at", cutoff).limit(5).execute().data
        )
        return [self._to_record(r) for r in rows]

    def update_run(self, run_id: str, **fields: Any) -> None:
        patch: dict[str, Any] = {}
        for k, v in fields.items():
            if k == "state":
                patch["content_plan"] = {"engine": "python", "engine_state": v}
            elif k in ("status", "error", "article_id", "started_at", "completed_at", "total_duration_ms", "geo_research", "draft", "geo_quality", "warnings"):
                patch[k] = v
        if patch:
            self.sb.table("blog_generation_runs").update(patch).eq("id", run_id).execute()

    def save_state(self, run_id: str, state: dict[str, Any]) -> None:
        self.update_run(run_id, state=state)

    def run_status(self, run_id: str) -> str:
        data = self.sb.table("blog_generation_runs").select("status").eq("id", run_id).limit(1).execute().data
        return data[0]["status"] if data else "missing"

    # --- nodes / events / sources ----------------------------------------

    def ensure_nodes(self, run: RunRecord, node_defs: list[tuple[str, str, str]]) -> None:
        existing = {r["node_key"] for r in self.sb.table("blog_generation_nodes").select("node_key").eq("run_id", run.id).execute().data}
        rows = [
            {"run_id": run.id, "site_id": run.site_id, "node_key": key, "label": label, "type": typ, "status": "queued", "sort_order": i}
            for i, (key, label, typ) in enumerate(node_defs) if key not in existing
        ]
        if rows:
            self.sb.table("blog_generation_nodes").insert(rows).execute()

    def update_node(self, run_id: str, update: NodeUpdate) -> None:
        patch: dict[str, Any] = {}
        for k, v in vars(update).items():
            if k == "node_key" or v in ("", None, -1):
                continue
            patch[k] = v
        if patch:
            self.sb.table("blog_generation_nodes").update(patch).eq("run_id", run_id).eq("node_key", update.node_key).execute()

    def add_event(self, run: RunRecord, level: str, message: str, node_key: str = "", metadata: dict[str, Any] | None = None) -> None:
        self.sb.table("blog_generation_events").insert({
            "run_id": run.id, "site_id": run.site_id, "node_key": node_key or None, "level": level,
            "message": message[:2000], "metadata": metadata or {},
        }).execute()

    def add_sources(self, run: RunRecord, entries: list[KnowledgeEntry], scores: dict[str, float]) -> None:
        if not entries:
            return
        self.sb.table("blog_generation_sources").delete().eq("run_id", run.id).execute()
        rows = [{
            "run_id": run.id, "site_id": run.site_id, "node_key": "load_knowledge", "doc_id": e.id,
            "source_type": "knowledge_entry", "title": f"{e.title}", "url": e.evidence_url() or None,
            "excerpt": e.body[:400], "score": scores.get(e.id), "used_in": [], "citation_status": "unsupported",
        } for e in entries]
        self.sb.table("blog_generation_sources").insert(rows).execute()

    def mark_sources_used(self, run_id: str, entry_to_facts: dict[str, list[str]]) -> None:
        for entry_id, facts in entry_to_facts.items():
            self.sb.table("blog_generation_sources").update({"used_in": facts, "citation_status": "supported" if facts else "unsupported"}) \
                .eq("run_id", run_id).eq("doc_id", entry_id).execute()

    # --- sites, knowledge & context ---------------------------------------

    def list_sites(self) -> list[SiteInfo]:
        rows = self.sb.table("marketing_sites").select("*").order("sort_order").execute().data
        return [_site_from_row(r) for r in rows]

    def site_info(self, site_id: str) -> SiteInfo:
        data = self.sb.table("marketing_sites").select("*").eq("id", site_id).limit(1).execute().data
        if not data:
            raise RuntimeError(f"site {site_id} not found")
        return _site_from_row(data[0])

    def load_knowledge(self, site_id: str) -> list[KnowledgeEntry]:
        rows = self.sb.table("knowledge_entries").select("id, section, title, body, attributes, markets, language, status, priority, source") \
            .eq("site_id", site_id).neq("status", "archived").execute().data
        return [KnowledgeEntry.model_validate(r) for r in rows]

    def prompt_overrides(self, site_id: str, pipeline: str = "engine") -> dict[str, str]:
        try:
            rows = self.sb.table("agent_prompt_templates").select("node_key, system_prompt_override").eq("site_id", site_id).eq("pipeline", pipeline).execute().data
        except Exception:  # noqa: BLE001 - optional table
            return {}
        return {r["node_key"]: r["system_prompt_override"] for r in rows if r.get("system_prompt_override")}

    def published_articles(self, site: SiteInfo) -> list[dict[str, str]]:
        rows = self.sb.table("cms_articles").select("slug, title").eq("site_id", site.id).eq("status", "published").order("published_at", desc=True).limit(60).execute().data
        return [{"slug": r["slug"], "title": r["title"], "url": site.article_url(r["slug"])} for r in rows]

    def search_queries(self, site_id: str) -> list[dict[str, Any]]:
        """Search Console query x page rows (28 days), synced by the dashboard."""
        return self.sb.table("gsc_query_pages").select("query, page, impressions, clicks, position").eq("site_id", site_id).limit(5000).execute().data

    def recent_target_queries(self, site_id: str, days: int = 90) -> set[str]:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        rows = self.sb.table("blog_generation_runs").select("setup").eq("site_id", site_id).gte("created_at", since).limit(1000).execute().data
        return {str((r.get("setup") or {}).get("target_query") or "").strip().lower() for r in rows} - {""}

    def unique_slug(self, site_id: str, slug: str) -> str:
        rows = self.sb.table("cms_articles").select("slug").eq("site_id", site_id).like("slug", f"{slug}%").execute().data
        taken = {r["slug"] for r in rows}
        if slug not in taken:
            return slug
        for i in range(2, 200):
            if f"{slug}-{i}" not in taken:
                return f"{slug}-{i}"
        return f"{slug}-{uuid.uuid4().hex[:6]}"

    def published_count(self, site_id: str) -> int:
        res = self.sb.table("cms_articles").select("id", count="exact").eq("site_id", site_id).eq("status", "published").limit(1).execute()
        count = getattr(res, "count", None)
        return int(count) if count is not None else len(res.data or [])

    # --- prompts (geo_prompts) --------------------------------------------

    def selected_prompts(self, site_id: str) -> list[dict[str, Any]]:
        return self.sb.table("geo_prompts").select("id, prompt, search_query, impressions").eq("site_id", site_id) \
            .eq("selected", True).eq("archived", False).limit(500).execute().data

    def prompts_with_articles(self, site_id: str, days: int = 90) -> set[str]:
        """Prompts a run in the window already wrote for (has an article) or is
        writing for right now (queued/running)."""
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        try:
            rows = self.sb.table("blog_generation_runs").select("prompt_id, article_id, status").eq("site_id", site_id) \
                .not_.is_("prompt_id", "null").gte("created_at", since).limit(1000).execute().data
        except Exception:  # noqa: BLE001 - column arrives with migration 20261019
            return set()
        return {str(r["prompt_id"]) for r in rows if r.get("prompt_id") and (r.get("article_id") or r.get("status") in ("queued", "running"))}

    def list_prompts(self, site_id: str) -> list[dict[str, Any]]:
        return self.sb.table("geo_prompts").select("id, prompt, search_query, impressions, source, selected").eq("site_id", site_id) \
            .eq("archived", False).order("created_at").limit(1000).execute().data

    def insert_prompts(self, site_id: str, rows: list[dict[str, Any]]) -> int:
        payload = [{
            "site_id": site_id, "prompt": r["prompt"][:500], "search_query": (r.get("search_query") or "")[:300],
            "impressions": r.get("impressions"), "source": r.get("source") or "analysis", "created_by": r.get("created_by") or "engine",
        } for r in rows if (r.get("prompt") or "").strip()]
        if not payload:
            return 0
        data = self.sb.table("geo_prompts").upsert(payload, on_conflict="site_id,prompt", ignore_duplicates=True).execute().data
        return len(data or [])

    def gsc_impressions(self, site_id: str) -> dict[str, int]:
        out: dict[str, int] = {}
        try:
            rows = self.sb.table("gsc_queries").select("query, impressions").eq("site_id", site_id).limit(5000).execute().data
        except Exception:  # noqa: BLE001 - Search Console may not be connected
            return out
        for r in rows:
            q = (r.get("query") or "").strip().lower()
            if q:
                out[q] = out.get(q, 0) + int(r.get("impressions") or 0)
        return out

    # --- competitors and their pages --------------------------------------

    def list_competitors(self, site_id: str) -> list[dict[str, Any]]:
        return self.sb.table("marketing_competitors").select("*").eq("site_id", site_id).eq("status", "active").order("created_at").execute().data

    def update_competitor(self, competitor_id: str, **fields: Any) -> None:
        allowed = {"name", "url", "domain", "blog_url", "sitemap_url", "pages_count", "best_page_url", "best_page_note", "cited_count", "search_hits", "last_analysed_at"}
        patch = {k: v for k, v in fields.items() if k in allowed}
        if patch:
            patch["updated_at"] = _now()
            self.sb.table("marketing_competitors").update(patch).eq("id", competitor_id).execute()

    def upsert_pages(self, competitor_id: str, site_id: str, pages: list[dict[str, Any]]) -> None:
        now = _now()
        rows = [{
            "competitor_id": competitor_id, "site_id": site_id, "url": p["url"], "title": (p.get("title") or None),
            "published_at": p.get("published_at") or None, "last_seen_at": now,
        } for p in pages if p.get("url")]
        for chunk in _chunks(rows):
            self.sb.table("competitor_pages").upsert(chunk, on_conflict="competitor_id,url").execute()

    def reset_page_counts(self, site_id: str) -> None:
        self.sb.table("competitor_pages").update({"cited_count": 0, "search_hits": 0}).eq("site_id", site_id).execute()

    def bump_page_counts(self, site_id: str, counts: dict[str, dict[str, int]]) -> None:
        for url, c in counts.items():
            cited, search = int(c.get("cited") or 0), int(c.get("search") or 0)
            if cited or search:
                self.sb.table("competitor_pages").update({"cited_count": cited, "search_hits": search}).eq("site_id", site_id).eq("url", url).execute()

    # --- analyses -----------------------------------------------------------

    def get_analysis(self, analysis_id: str) -> dict[str, Any] | None:
        data = self.sb.table("geo_analyses").select("*").eq("id", analysis_id).limit(1).execute().data
        return data[0] if data else None

    def update_analysis(self, analysis_id: str, **fields: Any) -> None:
        allowed = {"status", "pages_read", "prompts_checked", "cited_count", "cost_usd", "model", "summary", "error", "started_at", "completed_at"}
        patch = {k: v for k, v in fields.items() if k in allowed}
        if patch:
            self.sb.table("geo_analyses").update(patch).eq("id", analysis_id).execute()

    def claim_queued_analyses(self, limit: int = 1, older_than_seconds: int = 0) -> list[dict[str, Any]]:
        q = self.sb.table("geo_analyses").select("*").eq("status", "queued").order("created_at").limit(limit)
        if older_than_seconds > 0:
            q = q.lt("created_at", (datetime.now(timezone.utc) - timedelta(seconds=older_than_seconds)).isoformat())
        claimed: list[dict[str, Any]] = []
        for row in q.execute().data:
            updated = self.sb.table("geo_analyses").update({"status": "running", "started_at": _now()}).eq("id", row["id"]).eq("status", "queued").execute().data
            if updated:
                row["status"] = "running"
                claimed.append(row)
        return claimed

    def list_stale_running_analyses(self, older_than_minutes: int) -> list[dict[str, Any]]:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=older_than_minutes)).isoformat()
        return self.sb.table("geo_analyses").select("id, site_id, started_at").eq("status", "running").lt("started_at", cutoff).limit(5).execute().data

    def replace_results(self, analysis_id: str, rows: list[dict[str, Any]]) -> None:
        self.sb.table("geo_prompt_results").delete().eq("analysis_id", analysis_id).execute()
        payload = [{
            "analysis_id": analysis_id, "site_id": r["site_id"], "prompt_id": r["prompt_id"],
            "cited_domains": list(r.get("cited_domains") or []), "cited_urls": list(r.get("cited_urls") or []), "search_urls": list(r.get("search_urls") or []),
            "us_cited": bool(r.get("us_cited")), "tone": r.get("tone") or "not_mentioned", "answer_excerpt": (r.get("answer_excerpt") or "")[:2000] or None,
        } for r in rows]
        for chunk in _chunks(payload):
            self.sb.table("geo_prompt_results").insert(chunk).execute()

    # --- output -----------------------------------------------------------

    def save_article(self, run: RunRecord, article: Article, status: str, category: str, topic: str = "") -> str:
        now = _now()
        row: dict[str, Any] = {
            "site_id": run.site_id,
            "title": article.title,
            "slug": article.slug,
            "excerpt": article.excerpt,
            "topic": topic or None,
            "content_html": article.html,
            "content_json": {
                "format": "markdown", "markdown": article.markdown, "markdown_with_markers": article.markdown_with_markers,
                "engine": "python", "run_id": run.id, "language": article.language, "market": article.market,
                "faq": [f.model_dump() for f in article.faq], "knowledge_ids_used": article.knowledge_ids_used, "fact_ids_used": article.fact_ids_used,
            },
            "meta_description": article.meta_description,
            "schema_jsonld": article.json_ld,
            "status": status,
            "category": category,
            "language": article.language,
            "market": article.market,
            "word_count": article.word_count,
            "quality_score": article.scores.get("groundedness"),
            "published_at": now if status == "published" else None,
        }
        data = self.sb.table("cms_articles").insert(row).execute().data
        return data[0]["id"]

    def record_spend(self, site_id: str, cost_usd: float, article_id: str = "", source: str = "manual") -> None:
        row: dict[str, Any] = {"site_id": site_id, "kind": "article", "cost_usd": round(cost_usd, 6), "source": source[:100]}
        if article_id:
            row["article_id"] = article_id
        try:
            self.sb.table("content_spend").insert(row).execute()
        except Exception:  # noqa: BLE001 - spend ledger is best-effort
            pass

    # --- knowledge bank writes (CLI embed) ---------------------------------

    def embed_missing(self, site_id: str, embed_fn: Any, model: str) -> int:
        rows = self.sb.table("knowledge_entries").select("id, title, body").eq("site_id", site_id).eq("section", "document").is_("embedding", "null").limit(100).execute().data
        if not rows:
            return 0
        vectors = embed_fn([f"{r['title']}\n{r['body'][:6000]}" for r in rows]) or []
        for r, v in zip(rows, vectors):
            self.sb.table("knowledge_entries").update({"embedding": json.dumps(v), "embedding_model": model}).eq("id", r["id"]).execute()
        return len(vectors)
