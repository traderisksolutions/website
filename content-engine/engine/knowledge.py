"""Knowledge bank loading and selection.

Structured sections (business, product, case_study, claim, market) are small
and always loaded whole — a fact checker cannot verify against what it never
saw. Free-form documents are retrieved by similarity (embeddings when an
OpenAI key exists, keyword overlap otherwise) so a large document library
still fits.

Every selected entry gets a short alias (K1, K2, ...) that agents cite; the
alias map turns those back into real ids for storage.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from .llm import LLM
from .markets import get_market
from .models import KnowledgeEntry, RunSetup

SECTION_ORDER = ["business", "product", "claim", "case_study", "market", "document"]
SECTION_LABEL = {
    "business": "Business facts",
    "product": "Products and services",
    "claim": "Approved claims",
    "case_study": "Case studies",
    "market": "Market notes",
    "document": "Documents",
}
MAX_DOCUMENTS = 6
MAX_ENTRY_CHARS = 6000


@dataclass
class KnowledgeSelection:
    entries: list[KnowledgeEntry]
    alias_to_id: dict[str, str] = field(default_factory=dict)
    id_to_alias: dict[str, str] = field(default_factory=dict)
    retrieval_query: str = ""
    document_scores: dict[str, float] = field(default_factory=dict)
    focus_alias: str = ""

    def entry_by_alias(self, alias: str) -> KnowledgeEntry | None:
        entry_id = self.alias_to_id.get(alias.strip().upper())
        if not entry_id:
            return None
        return next((e for e in self.entries if e.id == entry_id), None)

    def ids_for_aliases(self, aliases: list[str]) -> list[str]:
        out: list[str] = []
        for a in aliases:
            entry_id = self.alias_to_id.get(a.strip().upper())
            if entry_id and entry_id not in out:
                out.append(entry_id)
        return out

    def summary(self) -> str:
        counts: dict[str, int] = {}
        for e in self.entries:
            counts[e.section] = counts.get(e.section, 0) + 1
        return ", ".join(f"{SECTION_LABEL.get(s, s)}: {n}" for s, n in sorted(counts.items(), key=lambda kv: SECTION_ORDER.index(kv[0]) if kv[0] in SECTION_ORDER else 99))


def _applies_to_market(entry: KnowledgeEntry, market: str) -> bool:
    if not entry.markets:
        return True
    return market.upper() in {m.upper() for m in entry.markets}


_WORD = re.compile(r"[a-z0-9]{3,}")


def keyword_score(query: str, text: str) -> float:
    q = set(_WORD.findall(query.lower()))
    if not q:
        return 0.0
    t = _WORD.findall(text.lower())
    if not t:
        return 0.0
    tf: dict[str, int] = {}
    for w in t:
        tf[w] = tf.get(w, 0) + 1
    hits = sum(math.log1p(tf.get(w, 0)) for w in q)
    return round(hits / len(q), 4)


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def retrieval_query(setup: RunSetup) -> str:
    parts = [setup.topic, setup.reader_question, setup.focus.label, get_market(setup.market).name]
    return " — ".join(p for p in parts if p and p.strip())[:500] or "business overview"


def select_knowledge(entries: list[KnowledgeEntry], setup: RunSetup, llm: LLM | None = None) -> KnowledgeSelection:
    market = (setup.market or "SG").upper()
    active = [e for e in entries if e.status != "archived" and _applies_to_market(e, market)]

    structured = [e for e in active if e.section != "document"]
    documents = [e for e in active if e.section == "document"]

    # Focused entry first, then by priority, then by section order.
    def sort_key(e: KnowledgeEntry) -> tuple[int, int, int, str]:
        focused = 0 if (setup.focus.id and e.id == setup.focus.id) else 1
        section_rank = SECTION_ORDER.index(e.section) if e.section in SECTION_ORDER else 99
        return (focused, section_rank, -e.priority, e.title.lower())

    structured.sort(key=sort_key)

    query = retrieval_query(setup)
    scores: dict[str, float] = {}
    chosen_docs: list[KnowledgeEntry] = []
    if documents:
        vectors = None
        if llm is not None:
            try:
                vectors = llm.embed([query] + [f"{d.title}\n{d.body[:4000]}" for d in documents])
            except Exception:  # noqa: BLE001 - keyword fallback below
                vectors = None
        if vectors:
            qv = vectors[0]
            for d, v in zip(documents, vectors[1:]):
                scores[d.id] = round(_cosine(qv, v), 4)
        else:
            for d in documents:
                scores[d.id] = keyword_score(query, f"{d.title}\n{d.body}")
        ranked = sorted(documents, key=lambda d: (-(scores.get(d.id, 0.0)), -d.priority))
        chosen_docs = [d for d in ranked[:MAX_DOCUMENTS] if scores.get(d.id, 0.0) > 0 or vectors]

    selected = structured + chosen_docs
    selection = KnowledgeSelection(entries=selected, retrieval_query=query, document_scores=scores)
    for i, e in enumerate(selected, start=1):
        alias = f"K{i}"
        selection.alias_to_id[alias] = e.id
        selection.id_to_alias[e.id] = alias
        if setup.focus.id and e.id == setup.focus.id:
            selection.focus_alias = alias
    return selection


def format_entry(alias: str, entry: KnowledgeEntry) -> str:
    status = "verified" if entry.status == "verified" else "draft — unverified"
    scope = ", ".join(entry.markets) if entry.markets else "all markets"
    body = entry.body.strip()
    if len(body) > MAX_ENTRY_CHARS:
        body = body[:MAX_ENTRY_CHARS] + " …"
    extras = []
    for key, value in entry.attributes.items():
        if key in ("evidence_url", "source_url", "url", "evidence_note", "key_features", "use_cases", "outcomes", "unique_value", "pricing_notes", "regulators", "currency", "notes"):
            if isinstance(value, str) and value.strip():
                extras.append(f"{key.replace('_', ' ').capitalize()}: {value.strip()}")
    extra_text = ("\n" + "\n".join(extras)) if extras else ""
    return f"[{alias}] ({SECTION_LABEL.get(entry.section, entry.section)} · {status} · {scope}) {entry.title}\n{body}{extra_text}"


def format_knowledge(selection: KnowledgeSelection) -> str:
    if not selection.entries:
        return "(The knowledge bank is empty.)"
    blocks: list[str] = []
    current = ""
    for e in selection.entries:
        if e.section != current:
            current = e.section
            blocks.append(f"\n## {SECTION_LABEL.get(current, current)}")
        blocks.append(format_entry(selection.id_to_alias[e.id], e))
    return "\n\n".join(blocks).strip()


def readiness(entries: list[KnowledgeEntry], market: str = "SG") -> dict[str, object]:
    """What the dashboard shows before Generate: which sections are filled."""
    active = [e for e in entries if e.status != "archived"]
    by_section: dict[str, int] = {}
    for e in active:
        by_section[e.section] = by_section.get(e.section, 0) + 1
    market_ok = any(e.section == "market" and _applies_to_market(e, market) and e.markets for e in active)
    return {
        "counts": by_section,
        "business": by_section.get("business", 0) > 0,
        "product": by_section.get("product", 0) > 0,
        "case_study": by_section.get("case_study", 0) > 0,
        "claim": by_section.get("claim", 0) > 0,
        "market": market_ok,
        "verified": sum(1 for e in active if e.status == "verified"),
        "total": len(active),
    }
