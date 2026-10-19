"""Poll loop: picks up queued engine runs and resumes runs that were left
'running' by a process that died. Also the safety net when the dashboard
cannot reach the engine's HTTP endpoint (local dev, a cold start): queued
competitor analyses older than ANALYSIS_BACKSTOP_SECONDS are claimed here."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
import threading
import time
from typing import Callable

from .config import Settings
from .store.base import Store

log = logging.getLogger("engine.worker")

STALE_MINUTES = 30
# An analysis that has been 'running' this long without a live thread died with the process;
# it cannot resume (no saved stages), so it is marked failed and the button frees up.
STALE_ANALYSIS_MINUTES = 90
ANALYSIS_BACKSTOP_SECONDS = 60


class Worker(threading.Thread):
    def __init__(self, settings: Settings, store: Store, is_active: Callable[[str], bool], launch: Callable[[str], None], launch_analysis: Callable[[str], None] | None = None):
        super().__init__(daemon=True, name="engine-worker")
        self.settings = settings
        self.store = store
        self.is_active = is_active
        self.launch = launch
        self.launch_analysis = launch_analysis
        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        log.info("worker polling every %ss", self.settings.poll_seconds)
        while not self._stop.is_set():
            try:
                self.tick()
            except Exception:  # noqa: BLE001
                log.exception("worker tick failed")
            self._stop.wait(self.settings.poll_seconds)

    def tick(self) -> None:
        for run in self.store.claim_queued_runs(limit=1):
            log.info("claimed queued run %s", run.id)
            threading.Thread(target=self.launch, args=(run.id,), daemon=True).start()
        for run in self.store.list_stale_running_runs(STALE_MINUTES):
            if not self.is_active(run.id):
                log.warning("resuming stale run %s", run.id)
                threading.Thread(target=self.launch, args=(run.id,), daemon=True).start()
        if self.launch_analysis is not None:
            try:
                analyses = self.store.claim_queued_analyses(limit=1, older_than_seconds=ANALYSIS_BACKSTOP_SECONDS)
            except Exception as e:  # noqa: BLE001 - geo_analyses arrives with migration 20261019
                log.debug("analysis backstop skipped: %s", str(e)[:200])
                analyses = []
            for a in analyses:
                log.info("claimed queued analysis %s", a["id"])
                threading.Thread(target=self.launch_analysis, args=(a["id"],), daemon=True).start()
            try:
                stale = self.store.list_stale_running_analyses(STALE_ANALYSIS_MINUTES)
            except Exception as e:  # noqa: BLE001 - same optional table
                log.debug("stale analysis sweep skipped: %s", str(e)[:200])
                stale = []
            for a in stale:
                if not self.is_active(f"analysis:{a['id']}"):
                    log.warning("analysis %s stale, marking failed", a["id"])
                    self.store.update_analysis(a["id"], status="failed", error="The engine restarted during the analysis. Run it again.", completed_at=datetime.now(timezone.utc).isoformat())


def run_forever(settings: Settings, store: Store, launch: Callable[[str], None]) -> None:
    active: set[str] = set()

    def wrapped(run_id: str) -> None:
        active.add(run_id)
        try:
            launch(run_id)
        finally:
            active.discard(run_id)

    worker = Worker(settings, store, is_active=lambda rid: rid in active, launch=wrapped)
    worker.start()
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        worker.stop()
