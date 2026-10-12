"""Poll loop: picks up queued engine runs and resumes runs that were left
'running' by a process that died. Also the safety net when the dashboard
cannot reach the engine's HTTP endpoint (local dev, a cold start)."""
from __future__ import annotations

import logging
import threading
import time
from typing import Callable

from .config import Settings
from .store.base import Store

log = logging.getLogger("engine.worker")

STALE_MINUTES = 30


class Worker(threading.Thread):
    def __init__(self, settings: Settings, store: Store, is_active: Callable[[str], bool], launch: Callable[[str], None]):
        super().__init__(daemon=True, name="engine-worker")
        self.settings = settings
        self.store = store
        self.is_active = is_active
        self.launch = launch
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
