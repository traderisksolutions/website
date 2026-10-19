"""HTTP surface for the dashboard, plus the background worker.

  GET  /health
  GET  /sites                                 the sites this engine writes for
  GET  /readiness?site_id=&market=SG          knowledge bank readiness for the Generate page
  POST /runs                                  create a run from a RunSetup (site_id required) and start it
  POST /runs/{run_id}/start                   start or resume an existing queued/failed run
  GET  /runs/{run_id}                         status
  POST /nightly?site_id=&count=               tonight's batch (all sites, or one)
  POST /analyses/{id}/start                   run a queued competitor analysis (geo_analyses row)
  GET  /analyses/{id}                         analysis status
  POST /knowledge/embed?site_id=              embed document entries that have no vector yet
  GET  /prompts                               default system prompts per node

All routes except /health require `Authorization: Bearer <CONTENT_ENGINE_SECRET>`.
"""
from __future__ import annotations

import logging
import threading
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException

from .competitors import run_analysis
from .config import Settings, get_settings
from .knowledge import readiness
from .llm import LLM
from .models import RunSetup
from .nightly import create_nightly_runs
from .pipeline import DEFAULT_PROMPTS, NODE_DEFS, Pipeline, start_run
from .store.supabase_store import SupabaseStore
from .worker import Worker

log = logging.getLogger("engine")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="TRS content engine", version="0.2.0")
_settings: Settings = get_settings()
_store: SupabaseStore | None = None
_worker: Worker | None = None
_active: set[str] = set()
_lock = threading.Lock()


def store() -> SupabaseStore:
    global _store
    if _store is None:
        _settings.require_supabase()
        _store = SupabaseStore(_settings.supabase_url, _settings.supabase_service_key, _settings.supabase_api_prefix)
    return _store


def auth(authorization: str = Header(default="")) -> None:
    if not _settings.engine_secret:
        raise HTTPException(500, "CONTENT_ENGINE_SECRET is not configured")
    if authorization != f"Bearer {_settings.engine_secret}":
        raise HTTPException(401, "unauthorized")


def _run_in_thread(run_id: str) -> None:
    with _lock:
        if run_id in _active:
            return
        _active.add(run_id)
    try:
        Pipeline(_settings, store()).run(run_id)
    except Exception:  # noqa: BLE001
        log.exception("run %s crashed", run_id)
    finally:
        with _lock:
            _active.discard(run_id)


def _analysis_in_thread(analysis_id: str) -> None:
    key = f"analysis:{analysis_id}"
    with _lock:
        if key in _active:
            return
        _active.add(key)
    try:
        run_analysis(_settings, store(), analysis_id)
    except Exception:  # noqa: BLE001
        log.exception("analysis %s crashed", analysis_id)
    finally:
        with _lock:
            _active.discard(key)


@app.on_event("startup")
def _startup() -> None:
    global _worker
    if _settings.poll_seconds > 0 and _settings.supabase_url:
        _worker = Worker(_settings, store(), is_active=lambda rid: rid in _active, launch=_run_in_thread, launch_analysis=_analysis_in_thread)
        _worker.start()


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "active_runs": sorted(_active), "models": {"strong": _settings.model_strong, "fast": _settings.model_fast}, "providers": _settings.provider_order}


@app.get("/sites", dependencies=[Depends(auth)])
def sites() -> dict[str, Any]:
    return {"sites": [{"id": s.id, "key": s.key, "name": s.name, "domain": s.domain, "nightly_count": s.nightly_count, "require_approval": s.require_approval} for s in store().list_sites()]}


@app.get("/readiness", dependencies=[Depends(auth)])
def readiness_route(site_id: str, market: str = "SG") -> dict[str, Any]:
    return readiness(store().load_knowledge(site_id), market)


@app.post("/runs", status_code=202, dependencies=[Depends(auth)])
def create_run(setup: RunSetup, background: BackgroundTasks) -> dict[str, Any]:
    if not setup.site_id:
        raise HTTPException(400, "site_id is required")
    setup.engine = "python"
    run = start_run(_settings, store(), setup)
    background.add_task(_run_in_thread, run.id)
    return {"runId": run.id, "status": "queued"}


@app.post("/runs/{run_id}/start", status_code=202, dependencies=[Depends(auth)])
def start_existing(run_id: str, background: BackgroundTasks) -> dict[str, Any]:
    run = store().get_run(run_id)
    if run is None:
        raise HTTPException(404, "run not found")
    if run.status in ("completed", "cancelled"):
        raise HTTPException(409, f"run is {run.status}")
    if run_id in _active:
        return {"runId": run_id, "status": "already running"}
    background.add_task(_run_in_thread, run_id)
    return {"runId": run_id, "status": "starting"}


@app.get("/runs/{run_id}", dependencies=[Depends(auth)])
def run_status(run_id: str) -> dict[str, Any]:
    run = store().get_run(run_id)
    if run is None:
        raise HTTPException(404, "run not found")
    return {"runId": run.id, "siteId": run.site_id, "status": run.status, "articleId": run.article_id, "error": run.error, "completed": run.state.get("completed", []), "cost_usd": run.state.get("cost_usd", 0), "nodes": [n[0] for n in NODE_DEFS]}


@app.post("/nightly", status_code=202, dependencies=[Depends(auth)])
def nightly(background: BackgroundTasks, site_id: str = "", count: int | None = None) -> dict[str, Any]:
    """Create tonight's batch for every site with nightly_count > 0 and run
    them one after another. Cloud Scheduler calls this once a day; the poll
    loop is the backstop."""
    runs = create_nightly_runs(_settings, store(), site_id=site_id, count=count)

    def run_all() -> None:
        for r in runs:
            _run_in_thread(r.id)

    background.add_task(run_all)
    return {"created": [r.id for r in runs], "count": len(runs)}


@app.post("/analyses/{analysis_id}/start", status_code=202, dependencies=[Depends(auth)])
def start_analysis(analysis_id: str, background: BackgroundTasks) -> dict[str, Any]:
    """The dashboard inserts a queued geo_analyses row, then calls this. The
    worker claims queued rows older than 60 s when this call never arrives."""
    analysis = store().get_analysis(analysis_id)
    if analysis is None:
        raise HTTPException(404, "analysis not found")
    if analysis.get("status") == "completed":
        raise HTTPException(409, "analysis is completed")
    if f"analysis:{analysis_id}" in _active:
        return {"analysisId": analysis_id, "status": "already running"}
    background.add_task(_analysis_in_thread, analysis_id)
    return {"analysisId": analysis_id, "status": "starting"}


@app.get("/analyses/{analysis_id}", dependencies=[Depends(auth)])
def analysis_status(analysis_id: str) -> dict[str, Any]:
    a = store().get_analysis(analysis_id)
    if a is None:
        raise HTTPException(404, "analysis not found")
    return {
        "analysisId": a["id"], "siteId": a["site_id"], "version": a.get("version"), "status": a["status"], "active": f"analysis:{analysis_id}" in _active,
        "pagesRead": a.get("pages_read", 0), "promptsChecked": a.get("prompts_checked", 0), "citedCount": a.get("cited_count", 0),
        "costUsd": a.get("cost_usd", 0), "model": a.get("model"), "error": a.get("error"), "summary": a.get("summary") or {},
        "startedAt": a.get("started_at"), "completedAt": a.get("completed_at"),
    }


@app.get("/prompts", dependencies=[Depends(auth)])
def prompt_defaults() -> dict[str, Any]:
    """Default system prompts per agent node. Overrides live in
    agent_prompt_templates (pipeline='engine'), read at the start of a run."""
    return {"nodes": [{"key": k, "label": l, "type": t} for k, l, t in NODE_DEFS], "prompts": DEFAULT_PROMPTS}


@app.post("/knowledge/embed", dependencies=[Depends(auth)])
def embed_knowledge(site_id: str) -> dict[str, Any]:
    llm = LLM(_settings)
    count = store().embed_missing(site_id, llm.embed, _settings.embed_model)
    return {"embedded": count}
