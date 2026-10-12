"""Persistence interface. The pipeline only ever talks to this, so the same
code runs against PostgREST in production and an in-memory store in tests."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from ..models import Article, KnowledgeEntry, RunSetup


@dataclass
class SiteInfo:
    """One of the business's websites: everything the engine needs to write
    for it and link back to it. Mirrors a marketing_sites row."""
    id: str
    key: str
    name: str
    domain: str
    base_url: str
    blog_base_path: str
    contact_url: str
    business_name: str
    markets: list[str] = field(default_factory=lambda: ["SG"])
    brand_terms: list[str] = field(default_factory=list)
    topic_terms: list[str] = field(default_factory=list)
    pillar_pages: list[dict[str, str]] = field(default_factory=list)  # {url, title}
    banned_terms: list[str] = field(default_factory=list)
    require_approval: bool = True
    nightly_count: int = 0

    def article_url(self, slug: str) -> str:
        return f"{self.base_url.rstrip('/')}{self.blog_base_path}/{slug}"


@dataclass
class RunRecord:
    id: str
    site_id: str
    status: str
    setup: RunSetup
    state: dict[str, Any] = field(default_factory=dict)  # stage outputs, resumable
    article_id: str = ""
    error: str = ""
    triggered_by: str = "manual"


@dataclass
class NodeUpdate:
    node_key: str
    status: str = ""
    started_at: str = ""
    completed_at: str = ""
    duration_ms: int = -1
    input_summary: str = ""
    output_summary: str = ""
    prompt: str = ""
    model: str = ""
    token_usage: dict[str, int] | None = None
    source_ids: list[str] | None = None
    error: str = ""
    metadata: dict[str, Any] | None = None


class Store(Protocol):
    # runs
    def create_run(self, site_id: str, setup: RunSetup, node_defs: list[tuple[str, str, str]], triggered_by: str = "manual") -> RunRecord: ...
    def get_run(self, run_id: str) -> RunRecord | None: ...
    def claim_queued_runs(self, limit: int = 1) -> list[RunRecord]: ...
    def list_stale_running_runs(self, older_than_minutes: int) -> list[RunRecord]: ...
    def update_run(self, run_id: str, **fields: Any) -> None: ...
    def save_state(self, run_id: str, state: dict[str, Any]) -> None: ...
    def run_status(self, run_id: str) -> str: ...
    # nodes / events / sources
    def ensure_nodes(self, run: RunRecord, node_defs: list[tuple[str, str, str]]) -> None: ...
    def update_node(self, run_id: str, update: NodeUpdate) -> None: ...
    def add_event(self, run: RunRecord, level: str, message: str, node_key: str = "", metadata: dict[str, Any] | None = None) -> None: ...
    def add_sources(self, run: RunRecord, entries: list[KnowledgeEntry], scores: dict[str, float]) -> None: ...
    def mark_sources_used(self, run_id: str, entry_to_facts: dict[str, list[str]]) -> None: ...
    # sites, knowledge & context
    def list_sites(self) -> list[SiteInfo]: ...
    def site_info(self, site_id: str) -> SiteInfo: ...
    def load_knowledge(self, site_id: str) -> list[KnowledgeEntry]: ...
    def prompt_overrides(self, site_id: str, pipeline: str = "engine") -> dict[str, str]: ...
    def published_articles(self, site: SiteInfo) -> list[dict[str, str]]: ...
    def search_queries(self, site_id: str) -> list[dict[str, Any]]: ...
    def recent_target_queries(self, site_id: str, days: int = 90) -> set[str]: ...
    def unique_slug(self, site_id: str, slug: str) -> str: ...
    # output
    def save_article(self, run: RunRecord, article: Article, status: str, category: str, topic: str = "") -> str: ...
    def record_spend(self, site_id: str, cost_usd: float, article_id: str = "", source: str = "manual") -> None: ...
