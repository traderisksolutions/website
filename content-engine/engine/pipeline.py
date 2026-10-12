"""The staged runner. A run is a list of stages; each stage's output is
saved before the next starts, so a crash, a cancel, or a redeploy resumes
from the last completed stage instead of paying for everything again.

Every stage writes a node row (status, timing, prompt, input/output
summaries, model, tokens, cost, knowledge used) and an event, which is what
the dashboard's canvas and inspector render.
"""
from __future__ import annotations

import json
import time
import traceback
from datetime import datetime, timezone
from typing import Any, Callable

from .agents import cta as cta_agent
from .agents import fact_checker, outliner, readability, researcher, seo_geo, strategist, writer
from .agents.base import AgentContext
from .assemble import assemble, slugify
from .config import Settings
from .knowledge import KnowledgeSelection, select_knowledge
from .llm import LLM
from .models import Article, CtaPlan, Draft, FactCheckReport, FactPack, KnowledgeEntry, Outline, QualityReport, RunSetup, SeoGeoPlan, Strategy, Usage
from .quality import BLOCKING_CODES, MARKER, quality_gate, readability_metrics
from .store.base import NodeUpdate, RunRecord, SiteInfo, Store

NODE_DEFS: list[tuple[str, str, str]] = [
    ("load_knowledge", "Load knowledge bank", "retrieval"),
    ("strategist", strategist.LABEL, "agent"),
    ("researcher", researcher.LABEL, "agent"),
    ("outliner", outliner.LABEL, "agent"),
    ("writer", writer.LABEL, "agent"),
    ("fact_checker", fact_checker.LABEL, "agent"),
    ("seo_geo_editor", seo_geo.LABEL, "agent"),
    ("readability_editor", readability.LABEL, "agent"),
    ("cta_composer", cta_agent.LABEL, "agent"),
    ("quality_gate", "Quality gate", "validation"),
    ("assemble", "Assemble the article", "formatting"),
    ("publish", "Save to CMS", "persistence"),
]

DEFAULT_PROMPTS: dict[str, str] = {
    "strategist": strategist.DEFAULT_PROMPT,
    "researcher": researcher.DEFAULT_PROMPT,
    "outliner": outliner.DEFAULT_PROMPT,
    "writer": writer.DEFAULT_PROMPT,
    "fact_checker": fact_checker.DEFAULT_PROMPT,
    "seo_geo_editor": seo_geo.DEFAULT_PROMPT,
    "readability_editor": readability.DEFAULT_PROMPT,
    "cta_composer": cta_agent.DEFAULT_PROMPT,
}


class RunCancelled(Exception):
    pass


class StageFailed(Exception):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _summ(obj: Any, limit: int = 1800) -> str:
    text = obj if isinstance(obj, str) else json.dumps(obj.model_dump() if hasattr(obj, "model_dump") else obj, ensure_ascii=False, indent=1, default=str)
    return text if len(text) <= limit else text[:limit] + " …"


class Pipeline:
    def __init__(self, settings: Settings, store: Store, llm: LLM | None = None, knowledge_override: list[KnowledgeEntry] | None = None):
        self.settings = settings
        self.store = store
        self.llm = llm or LLM(settings)
        self.knowledge_override = knowledge_override
        self._selection: KnowledgeSelection | None = None
        self._ctx: AgentContext | None = None
        self._site: SiteInfo | None = None

    def _site_for(self, run: RunRecord) -> SiteInfo:
        if self._site is None or self._site.id != run.site_id:
            self._site = self.store.site_info(run.site_id)
        return self._site

    # --- public -----------------------------------------------------------

    def run(self, run_id: str) -> RunRecord:
        run = self.store.get_run(run_id)
        if run is None:
            raise RuntimeError(f"run {run_id} not found")
        self.store.ensure_nodes(run, NODE_DEFS)
        state = run.state or {}
        started = time.time()
        if run.status != "running":
            self.store.update_run(run.id, status="running", started_at=_now(), error="")
            run.status = "running"
        self.store.add_event(run, "info", "Run started" if not state.get("completed") else f"Resuming after: {', '.join(state.get('completed', []))}")

        run.state = state
        try:
            self._execute(run, state)
            total_ms = int((time.time() - started) * 1000)
            self.store.update_run(run.id, status="completed", completed_at=_now(), total_duration_ms=total_ms, article_id=state.get("article_id", ""))
            self.store.add_event(run, "success", f"Run completed. Total cost ${state.get('cost_usd', 0):.3f}.")
            run.status = "completed"
            run.article_id = state.get("article_id", "")
        except RunCancelled:
            self.store.add_event(run, "warning", "Run cancelled by the user.")
            run.status = "cancelled"
        except Exception as err:  # noqa: BLE001 - the run row carries the error
            message = f"{type(err).__name__}: {err}"[:900]
            self.store.update_run(run.id, status="failed", error=message, completed_at=_now())
            self.store.add_event(run, "error", message, metadata={"trace": traceback.format_exc()[-3000:]})
            run.status = "failed"
            run.error = message
        return run

    # --- stages -----------------------------------------------------------

    def _execute(self, run: RunRecord, state: dict[str, Any]) -> None:
        setup = run.setup
        completed: list[str] = state.setdefault("completed", [])
        state.setdefault("cost_usd", 0.0)

        # Knowledge is loaded on every invocation (cheap, and the selection
        # object holds the alias map every later stage needs).
        self._stage(run, state, "load_knowledge", lambda: self._load_knowledge(run), always=True)
        selection = self._selection
        assert selection is not None and self._ctx is not None
        ctx = self._ctx

        strategy = self._stage(run, state, "strategist", lambda: self._agent(run, state, "strategist", lambda: strategist.run(ctx), Strategy, selection))
        pack = self._stage(run, state, "researcher", lambda: self._agent(run, state, "researcher", lambda: researcher.run(ctx, strategy), FactPack, selection))
        outline = self._stage(run, state, "outliner", lambda: self._agent(run, state, "outliner", lambda: outliner.run(ctx, strategy, pack), Outline, selection))
        draft = self._stage(run, state, "writer", lambda: self._agent(run, state, "writer", lambda: writer.run(ctx, strategy, pack, outline), Draft, selection))
        check = self._stage(run, state, "fact_checker", lambda: self._fact_check_loop(run, state, ctx, draft, pack, selection))
        draft = Draft.model_validate(state["draft"])  # the loop may have revised it
        seo = self._stage(run, state, "seo_geo_editor", lambda: self._agent(run, state, "seo_geo_editor", lambda: seo_geo.run(ctx, draft, strategy), SeoGeoPlan, selection))
        edited_md = self._stage(run, state, "readability_editor", lambda: self._readability(run, state, ctx, seo.markdown or draft.markdown))
        ctas = self._stage(run, state, "cta_composer", lambda: self._agent(run, state, "cta_composer", lambda: cta_agent.run(ctx, strategy, pack), CtaPlan, selection))

        if not seo.title.strip():
            seo.title = draft.title.strip()
        quality = self._stage(run, state, "quality_gate", lambda: self._quality(run, state, seo, edited_md, pack, check, ctas, outline, ctx))
        article = self._stage(run, state, "assemble", lambda: self._assemble(run, state, seo, edited_md, ctas, pack, selection, outline, ctx, quality, draft.title))
        self._stage(run, state, "publish", lambda: self._publish(run, state, article, quality, check, pack, selection))

    def _stage(self, run: RunRecord, state: dict[str, Any], key: str, fn: Callable[[], Any], always: bool = False) -> Any:
        if not always and key in state.get("completed", []) and key in state.get("outputs", {}):
            self._restore(run, key)
            return self._rehydrate(key, state["outputs"][key])
        if self.store.run_status(run.id) == "cancelled":
            raise RunCancelled()

        attempts = self.settings.max_stage_attempts
        last_error = ""
        for attempt in range(1, attempts + 1):
            started_at = _now()
            t0 = time.time()
            self.store.update_node(run.id, NodeUpdate(node_key=key, status="running", started_at=started_at, error=""))
            try:
                result = fn()
                duration = int((time.time() - t0) * 1000)
                self.store.update_node(run.id, NodeUpdate(node_key=key, status="completed", completed_at=_now(), duration_ms=duration))
                if not always:
                    state.setdefault("outputs", {})[key] = self._serialize(result)
                    if key not in state["completed"]:
                        state["completed"].append(key)
                    self.store.save_state(run.id, state)
                return result
            except RunCancelled:
                self.store.update_node(run.id, NodeUpdate(node_key=key, status="skipped", error="cancelled"))
                raise
            except Exception as err:  # noqa: BLE001 - retried below, then surfaced
                last_error = f"{type(err).__name__}: {err}"[:600]
                self.store.add_event(run, "warning", f"{key} attempt {attempt} of {attempts} failed: {last_error}", node_key=key)
                if attempt < attempts:
                    time.sleep(min(5 * attempt, 20))
        self.store.update_node(run.id, NodeUpdate(node_key=key, status="failed", completed_at=_now(), error=last_error))
        raise StageFailed(f"{key} failed after {attempts} attempts: {last_error}")

    def _restore(self, run: RunRecord, key: str) -> None:
        self.store.update_node(run.id, NodeUpdate(node_key=key, status="completed"))

    @staticmethod
    def _serialize(result: Any) -> Any:
        if hasattr(result, "model_dump"):
            return result.model_dump()
        return result

    @staticmethod
    def _rehydrate(key: str, raw: Any) -> Any:
        types: dict[str, Any] = {
            "strategist": Strategy, "researcher": FactPack, "outliner": Outline, "writer": Draft, "fact_checker": FactCheckReport,
            "seo_geo_editor": SeoGeoPlan, "cta_composer": CtaPlan, "quality_gate": QualityReport, "assemble": Article,
        }
        model = types.get(key)
        return model.model_validate(raw) if model and isinstance(raw, dict) else raw

    # --- stage bodies -----------------------------------------------------

    def _load_knowledge(self, run: RunRecord) -> dict[str, Any]:
        setup = run.setup
        site = self._site_for(run)
        entries = self.knowledge_override if self.knowledge_override is not None else self.store.load_knowledge(run.site_id)
        if not entries:
            raise StageFailed("The knowledge bank is empty. Add business facts, products and case studies before generating.")
        selection = select_knowledge(entries, setup, self.llm)
        if not selection.entries:
            raise StageFailed(f"No knowledge entries apply to market {setup.market}.")
        overrides = self.store.prompt_overrides(run.site_id, "engine")
        # The site's own service pages lead the internal-link list: every article
        # that links to them with descriptive anchor text lends them ranking for
        # the head terms they own.
        pillars = [{"slug": p["url"].rstrip("/").split("/")[-1], "title": p.get("title") or p["url"], "url": p["url"]} for p in site.pillar_pages]
        published = pillars + self.store.published_articles(site)
        self._selection = selection
        self._ctx = AgentContext(
            settings=self.settings, llm=self.llm, setup=setup, knowledge=selection,
            business_name=site.business_name or site.name, domain=site.domain, prompt_overrides=overrides, published_articles=published,
        )
        self.store.add_sources(run, selection.entries, selection.document_scores)
        summary = {"selected": len(selection.entries), "by_section": selection.summary(), "retrieval_query": selection.retrieval_query,
                   "drafts_unverified": sum(1 for e in selection.entries if e.status != "verified")}
        self.store.update_node(run.id, NodeUpdate(
            node_key="load_knowledge", input_summary=f"Market {setup.market}; focus {setup.focus.type} {setup.focus.label or '(none)'}; query: {selection.retrieval_query}",
            output_summary=_summ(summary), source_ids=[e.id for e in selection.entries],
            metadata={"knowledge_entry_ids": [e.id for e in selection.entries], "cost_usd": 0, "aliases": selection.id_to_alias},
        ))
        self.store.add_event(run, "info", f"Loaded {len(selection.entries)} knowledge entries ({selection.summary()}).", node_key="load_knowledge")
        return summary

    def _agent(self, run: RunRecord, state: dict[str, Any], key: str, call: Callable[[], tuple[Any, Usage]], model_type: Any, selection: KnowledgeSelection, node_key: str = "") -> Any:
        node_key = node_key or key
        result, usage = call()
        self._record_usage(run, state, node_key, result, usage, selection)
        return result

    def _record_usage(self, run: RunRecord, state: dict[str, Any], node_key: str, result: Any, usage: Usage, selection: KnowledgeSelection, extra_meta: dict[str, Any] | None = None) -> None:
        state["cost_usd"] = round(float(state.get("cost_usd", 0.0)) + usage.cost_usd, 6)
        # Which provider/model the run actually used. A fallback mid-run means
        # one run can span two, so this accumulates rather than overwrites.
        stamp = f"{usage.provider}:{usage.model}"
        used = state.setdefault("providers_used", [])
        if stamp not in used:
            used.append(stamp)
        knowledge_ids = self._knowledge_ids_in(result, selection)
        fact_ids = self._fact_ids_in(result)
        meta = {"cost_usd": usage.cost_usd, "knowledge_entry_ids": knowledge_ids, "fact_ids": fact_ids, "provider": usage.provider, "attempts": usage.attempts, "latency_ms": usage.latency_ms}
        if extra_meta:
            meta.update(extra_meta)
        system, _, user = usage.prompt_text.partition("\n\nUSER:\n")
        self.store.update_node(run.id, NodeUpdate(
            node_key=node_key, prompt=usage.prompt_text, input_summary=user[:1800], output_summary=_summ(result), model=usage.model,
            token_usage={"input": usage.tokens_in, "output": usage.tokens_out}, source_ids=knowledge_ids, metadata=meta,
        ))
        self.store.add_event(run, "info", f"{node_key}: {usage.model} · {usage.tokens_in}+{usage.tokens_out} tokens · ${usage.cost_usd:.4f}", node_key=node_key, metadata=meta)

    @staticmethod
    def _knowledge_ids_in(result: Any, selection: KnowledgeSelection) -> list[str]:
        aliases: list[str] = []
        if isinstance(result, Strategy):
            aliases = result.knowledge_ids_to_lean_on
        elif isinstance(result, FactPack):
            aliases = [f.knowledge_id for f in result.facts if f.knowledge_id]
        return selection.ids_for_aliases(aliases)

    @staticmethod
    def _fact_ids_in(result: Any) -> list[str]:
        text = ""
        if isinstance(result, (Draft, SeoGeoPlan)):
            text = result.markdown
        elif isinstance(result, str):
            text = result
        elif isinstance(result, FactPack):
            return [f.id for f in result.facts]
        elif isinstance(result, FactCheckReport):
            return sorted({fid for c in result.claims for fid in c.fact_ids})
        return sorted({f"F{m}" for m in MARKER.findall(text)}, key=lambda s: int(s[1:]))

    def _fact_check_loop(self, run: RunRecord, state: dict[str, Any], ctx: AgentContext, draft: Draft, pack: FactPack, selection: KnowledgeSelection) -> FactCheckReport:
        current = draft
        report, usage = fact_checker.run(ctx, current, pack)
        self._record_usage(run, state, "fact_checker", report, usage, selection, {"round": 0, "verdict": report.verdict, "claims": report.counts()})
        revisions = 0
        while report.verdict != "pass" and revisions < self.settings.max_revisions:
            revisions += 1
            self.store.add_event(run, "warning", f"Fact check round {revisions}: {report.counts()} → revising the draft.", node_key="fact_checker")
            revised, u2 = writer.revise(ctx, current, pack, report.revision_instructions)
            state["cost_usd"] = round(float(state.get("cost_usd", 0.0)) + u2.cost_usd, 6)
            current = revised
            report, u3 = fact_checker.run(ctx, current, pack)
            self._record_usage(run, state, "fact_checker", report, u3, selection, {"round": revisions, "verdict": report.verdict, "claims": report.counts(), "revision_cost_usd": u2.cost_usd})
        state["draft"] = current.model_dump()
        state["revisions"] = revisions
        state.setdefault("outputs", {})["writer"] = current.model_dump()
        if report.verdict == "fail":
            raise StageFailed(f"Fact check failed after {revisions} revisions: {report.counts()}. The knowledge bank probably lacks what this article needs; see the gaps list.")
        return report

    def _readability(self, run: RunRecord, state: dict[str, Any], ctx: AgentContext, markdown: str) -> str:
        before = readability_metrics(markdown)
        if not before.get("problems"):
            self.store.update_node(run.id, NodeUpdate(node_key="readability_editor", input_summary="No measured readability problems; skipped the model call.", output_summary=_summ(before), model="none", metadata={"cost_usd": 0, "before": before, "after": before}))
            return markdown
        edit, usage = readability.run(ctx, markdown)
        result_md = edit.markdown or markdown
        # Never accept an edit that lost fact markers.
        if set(MARKER.findall(result_md)) != set(MARKER.findall(markdown)):
            self.store.add_event(run, "warning", "Readability edit changed fact markers; kept the previous version.", node_key="readability_editor")
            result_md = markdown
        after = readability_metrics(result_md)
        self._record_usage(run, state, "readability_editor", result_md, usage, self._selection or KnowledgeSelection(entries=[]), {"before": before, "after": after, "changes": edit.changes_made})
        return result_md

    def _quality(self, run: RunRecord, state: dict[str, Any], seo: SeoGeoPlan, markdown: str, pack: FactPack, check: FactCheckReport, ctas: CtaPlan, outline: Outline, ctx: AgentContext) -> QualityReport:
        site = self._site_for(run)
        contact = run.setup.contact_url or site.contact_url
        # Gate the article as it will be published: with CTAs and FAQ in place.
        from .assemble import append_faq, insert_ctas, strip_leading_h1
        gated_md = append_faq(insert_ctas(strip_leading_h1(markdown)[0], ctas, contact, outline.mid_cta_after_section), seo, ctx.language)
        report = quality_gate(title=seo.title, markdown=gated_md, meta_description=seo.meta_description, pack=pack, fact_check=check, min_words=self.settings.min_words, contact_url=contact, banned_terms=site.banned_terms)
        report.metrics["knowledge_gaps"] = pack.gaps
        self.store.update_node(run.id, NodeUpdate(node_key="quality_gate", input_summary=f"{len(pack.facts)} facts, fact-check verdict {check.verdict}", output_summary=_summ(report), metadata={"cost_usd": 0, "passed": report.passed, "failures": [f.code for f in report.failures]}))
        level = "success" if report.passed else "warning"
        self.store.add_event(run, level, "Quality gate passed." if report.passed else "Quality gate held the article: " + "; ".join(f.message for f in report.failures)[:600], node_key="quality_gate")
        return report

    def _assemble(self, run: RunRecord, state: dict[str, Any], seo: SeoGeoPlan, markdown: str, ctas: CtaPlan, pack: FactPack, selection: KnowledgeSelection, outline: Outline, ctx: AgentContext, quality: QualityReport, fallback_title: str = "") -> Article:
        site = self._site_for(run)
        article = assemble(
            plan=seo, markdown_with_markers=markdown, ctas=ctas, pack=pack, selection=selection, language=ctx.language, market=ctx.market.code,
            contact_url=run.setup.contact_url or site.contact_url, site_base_url=site.base_url, blog_base_path=site.blog_base_path,
            org_name=site.business_name or site.name, org_domain=site.domain, date_iso=_now(), mid_cta_after_section=outline.mid_cta_after_section,
            fallback_title=fallback_title,
        )
        article.slug = self.store.unique_slug(run.site_id, article.slug or slugify(article.title))
        article.scores = {"groundedness": quality.metrics.get("groundedness"), "readability": quality.metrics.get("avg_sentence_words"), "passed_gate": quality.passed, "cost_usd": state.get("cost_usd", 0)}
        self.store.update_node(run.id, NodeUpdate(node_key="assemble", input_summary=f"{len(pack.facts)} facts, {len(seo.faq)} FAQ, 2 CTAs", output_summary=f"{article.title}\n/{article.slug}\n{article.word_count} words\n{len(article.knowledge_ids_used)} knowledge entries cited", source_ids=article.knowledge_ids_used, metadata={"cost_usd": 0, "knowledge_entry_ids": article.knowledge_ids_used, "fact_ids": article.fact_ids_used}))
        return article

    def _publish(self, run: RunRecord, state: dict[str, Any], article: Article, quality: QualityReport, check: FactCheckReport, pack: FactPack, selection: KnowledgeSelection) -> dict[str, Any]:
        needs_human = self._site_for(run).require_approval
        # Approval off means style problems publish with a warning. A false or
        # banned claim is not a style problem: those codes hold the article as
        # pending regardless of the approval setting.
        blockers = [f for f in quality.failures if f.code in BLOCKING_CODES]
        if blockers:
            status = "pending"
            self.store.add_event(run, "error", "Held: claim check failed. " + "; ".join(f.message for f in blockers)[:500], node_key="publish")
        else:
            status = "pending" if needs_human else "published"
            if status == "published" and not quality.passed:
                self.store.add_event(run, "warning", "Published with quality warnings (approval is off): " + "; ".join(f.message for f in quality.failures)[:500], node_key="publish")
        article_id = self.store.save_article(run, article, status=status, category="engine", topic=run.setup.topic_label)
        entry_to_facts: dict[str, list[str]] = {}
        for f in pack.facts:
            if f.knowledge_id and f.id in article.fact_ids_used:
                entry_id = selection.alias_to_id.get(f.knowledge_id.upper())
                if entry_id:
                    entry_to_facts.setdefault(entry_id, []).append(f.id)
        self.store.mark_sources_used(run.id, entry_to_facts)
        state["article_id"] = article_id
        self.store.record_spend(
            run.site_id,
            float(state.get("cost_usd", 0.0)),
            article_id=article_id,
            source=",".join(state.get("providers_used", [])) or "unknown",
        )
        metrics = quality.metrics
        geo_quality = {
            "directAnswerPresent": True,
            "entityCoverageScore": min(1.0, len(article.knowledge_ids_used) / max(1, min(6, len(selection.entries)))),
            "sourceGroundingScore": float(metrics.get("groundedness") or 0),
            "citationCompletenessScore": 1.0 if not any(f.code == "unsupported_numeric_claim" for f in quality.failures) else 0.5,
            "structureScore": min(1.0, (metrics.get("h2_count") or 0) / 5),
            "targetRelevanceScore": 1.0 if run.setup.focus.id else 0.7,
            "unsupportedClaimCount": int(check.counts().get("unsupported", 0) + check.counts().get("contradicted", 0)),
            "missingTopics": list(pack.gaps)[:10],
            "recommendations": [f.message for f in quality.failures] + list(quality.warnings),
            "engine": {"passed_gate": quality.passed, "metrics": metrics, "cost_usd": state.get("cost_usd", 0), "status": status},
        }
        self.store.update_run(run.id, article_id=article_id, geo_quality=geo_quality, draft={"format": "markdown", "title": article.title, "slug": article.slug, "markdown": article.markdown, "meta_description": article.meta_description, "faq": [f.model_dump() for f in article.faq]}, warnings=quality.warnings)
        self.store.update_node(run.id, NodeUpdate(node_key="publish", input_summary=f"approval required: {needs_human}; gate passed: {quality.passed}", output_summary=f"cms_articles {article_id} saved as {status}", metadata={"cost_usd": 0, "article_id": article_id, "status": status}))
        self.store.add_event(run, "success", f"Article saved as {status}: {article.title}", node_key="publish", metadata={"article_id": article_id})
        return {"article_id": article_id, "status": status}


def start_run(settings: Settings, store: Store, setup: RunSetup, triggered_by: str = "manual") -> RunRecord:
    if not setup.site_id:
        raise ValueError("setup.site_id is required: every run belongs to one of the business's websites")
    return store.create_run(setup.site_id, setup, NODE_DEFS, triggered_by=triggered_by)
