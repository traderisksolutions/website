"""Command line entry points.

  python -m engine.cli generate --site-id <uuid> --market SG --focus-type product --focus-label "Work injury" --topic "..."
  python -m engine.cli generate --no-db --knowledge-file knowledge.json --out ./out
  python -m engine.cli resume <run_id>
  python -m engine.cli worker
  python -m engine.cli nightly [--site-id <uuid>] [--count N] [--no-run]
  python -m engine.cli embed --site-id <uuid>
  python -m engine.cli readiness --site-id <uuid> --market SG
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import get_settings
from .knowledge import readiness
from .llm import LLM
from .models import Focus, KnowledgeEntry, RunSetup
from .pipeline import Pipeline, start_run
from .store.local import LocalStore
from .store.supabase_store import SupabaseStore


def _load_knowledge_file(path: str) -> list[KnowledgeEntry]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    items = raw["entries"] if isinstance(raw, dict) else raw
    out = []
    for i, item in enumerate(items):
        item.setdefault("id", f"file:{i}:{item.get('section', 'x')}")
        out.append(KnowledgeEntry.model_validate(item))
    return out


def _db_store(settings) -> SupabaseStore:  # noqa: ANN001
    settings.require_supabase()
    return SupabaseStore(settings.supabase_url, settings.supabase_service_key, settings.supabase_api_prefix)


def cmd_generate(args: argparse.Namespace) -> int:
    settings = get_settings()
    site_id = args.site_id or settings.default_site_id or ("site-1" if args.no_db else "")
    if not site_id:
        print("--site-id (or ENGINE_DEFAULT_SITE_ID) is required", file=sys.stderr)
        return 2
    setup = RunSetup(
        site_id=site_id, topic_label=args.topic_label or "",
        focus=Focus(type=args.focus_type, id=args.focus_id or "", label=args.focus_label or ""),
        market=args.market, language=args.language or "", topic=args.topic or "", reader_question=args.question or "",
        length=args.length, extra_instructions=args.instructions or "", auto_publish=args.auto_publish,
    )
    knowledge = _load_knowledge_file(args.knowledge_file) if args.knowledge_file else None
    if args.no_db:
        if not knowledge:
            print("--no-db needs --knowledge-file", file=sys.stderr)
            return 2
        store = LocalStore(out_dir=args.out or "./out", knowledge=knowledge)
    else:
        store = _db_store(settings)
        if knowledge:
            knowledge = knowledge + store.load_knowledge(site_id)
    run = start_run(settings, store, setup)
    print(f"run {run.id} created")
    result = Pipeline(settings, store, knowledge_override=knowledge).run(run.id)
    print(f"run {result.id}: {result.status} {result.error or ''} article={result.article_id} cost=${result.state.get('cost_usd', 0):.3f}")
    if args.no_db and isinstance(store, LocalStore):
        for a in store.articles.values():
            print(f"saved {a['status']}: {a['title']} → {args.out or './out'}/{a['slug']}.md")
    return 0 if result.status == "completed" else 1


def cmd_resume(args: argparse.Namespace) -> int:
    settings = get_settings()
    result = Pipeline(settings, _db_store(settings)).run(args.run_id)
    print(f"run {result.id}: {result.status} {result.error or ''}")
    return 0 if result.status == "completed" else 1


def cmd_nightly(args: argparse.Namespace) -> int:
    from .nightly import create_nightly_runs

    settings = get_settings()
    store = _db_store(settings)
    runs = create_nightly_runs(settings, store, site_id=args.site_id or "", count=args.count)
    print(f"created {len(runs)} runs: {[r.id for r in runs]}")
    if not args.no_run:
        for r in runs:
            result = Pipeline(settings, store).run(r.id)
            print(f"run {result.id}: {result.status} {result.error or ''} article={result.article_id}")
    return 0


def cmd_worker(_: argparse.Namespace) -> int:
    from .worker import run_forever

    settings = get_settings()
    store = _db_store(settings)
    run_forever(settings, store, lambda rid: Pipeline(settings, store).run(rid))
    return 0


def cmd_embed(args: argparse.Namespace) -> int:
    settings = get_settings()
    n = _db_store(settings).embed_missing(args.site_id, LLM(settings).embed, settings.embed_model)
    print(f"embedded {n} document entries")
    return 0


def cmd_readiness(args: argparse.Namespace) -> int:
    settings = get_settings()
    entries = _load_knowledge_file(args.knowledge_file) if args.knowledge_file else _db_store(settings).load_knowledge(args.site_id)
    print(json.dumps(readiness(entries, args.market), indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="engine")
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generate")
    g.add_argument("--site-id", default="")
    g.add_argument("--market", default="SG", choices=["SG", "HK", "ID", "MY"])
    g.add_argument("--language", default="", choices=["", "en", "id"])
    g.add_argument("--focus-type", default="topic", choices=["product", "case_study", "market", "topic", "pillar", "question"])
    g.add_argument("--focus-id", default="")
    g.add_argument("--focus-label", default="")
    g.add_argument("--topic", default="")
    g.add_argument("--topic-label", default="", help="the site's own topic label for the article")
    g.add_argument("--question", default="")
    g.add_argument("--length", default="standard", choices=["standard", "long"])
    g.add_argument("--instructions", default="")
    g.add_argument("--knowledge-file", default="")
    g.add_argument("--no-db", action="store_true")
    g.add_argument("--out", default="")
    g.add_argument("--auto-publish", action="store_true")
    g.set_defaults(fn=cmd_generate)

    r = sub.add_parser("resume")
    r.add_argument("run_id")
    r.set_defaults(fn=cmd_resume)

    sub.add_parser("worker").set_defaults(fn=cmd_worker)

    n = sub.add_parser("nightly")
    n.add_argument("--site-id", default="")
    n.add_argument("--count", type=int, default=None, help="override every site's nightly_count")
    n.add_argument("--no-run", action="store_true", help="only create the queued runs; let the worker pick them up")
    n.set_defaults(fn=cmd_nightly)

    e = sub.add_parser("embed")
    e.add_argument("--site-id", required=True)
    e.set_defaults(fn=cmd_embed)

    rd = sub.add_parser("readiness")
    rd.add_argument("--site-id", default="")
    rd.add_argument("--market", default="SG")
    rd.add_argument("--knowledge-file", default="")
    rd.set_defaults(fn=cmd_readiness)

    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
