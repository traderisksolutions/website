"""Deterministic checks. No model grades its own homework here: these are
regex and arithmetic, and a failure means "hold for a human", never
"publish anyway".
"""
from __future__ import annotations

import re
from typing import Any

from .models import FactCheckReport, FactPack, QualityFailure, QualityReport

MARKER = re.compile(r"\[F(\d+)\]")
HEADING = re.compile(r"^(#{1,4})\s+(.+)$", re.M)
BOLD_LEAD = re.compile(r"^\s*\*\*[^*]+\*\*")

# Failures that hold an article back even when approval is off. Everything
# else (thin content, readability, structure) publishes with a warning. A
# false, banned or unsupported claim is not a style problem.
BLOCKING_CODES = {"prohibited_superlative", "prohibited_term", "unsupported_numeric_claim", "marker_in_metadata"}

SUPERLATIVES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bbest\b", re.I), '"best"'),
    (re.compile(r"\bcheapest\b", re.I), '"cheapest"'),
    (re.compile(r"\blowest\s+premiums?\b", re.I), '"lowest premium"'),
    (re.compile(r"\bleading\b", re.I), '"leading"'),
    (re.compile(r"\bpremier\b", re.I), '"premier"'),
    (re.compile(r"\bnumber\s*one\b", re.I), '"number one"'),
    (re.compile(r"#\s?1\b"), '"#1"'),
    (re.compile(r"\bmarket leader\b", re.I), '"market leader"'),
    (re.compile(r"\bworld[- ]class\b", re.I), '"world-class"'),
    (re.compile(r"\bguarantee[sd]?\b", re.I), '"guarantee"'),
    (re.compile(r"\bterbaik\b", re.I), '"terbaik" (best)'),
    (re.compile(r"\bterdepan\b", re.I), '"terdepan" (leading)'),
    (re.compile(r"\bdijamin\b|\bjaminan\b", re.I), '"dijamin/jaminan" (guarantee)'),
]

NUMERIC_CLAIM = re.compile(
    r"\b\d{1,3}(\.\d+)?\s?%|\b\d+(\.\d+)?x\b|\b(in|within|dalam)\s+(just\s+|only\s+|hanya\s+)?\d+\s+(days?|weeks?|hours?|months?|hari|minggu|jam|bulan)\b|\b(SGD|HKD|IDR|MYR|S\$|HK\$|RM|Rp)\s?\d",
    re.I,
)
EM_DASH = re.compile("[—]")


def word_count(text: str) -> int:
    return len([w for w in re.split(r"\s+", text.strip()) if w])


def _sentences(text: str) -> list[str]:
    cleaned = MARKER.sub("", text)
    parts = re.split(r"(?<=[.!?])\s+", cleaned)
    return [p.strip() for p in parts if len(p.strip()) > 2]


def _paragraphs(markdown: str) -> list[str]:
    out = []
    for block in re.split(r"\n\s*\n", markdown):
        b = block.strip()
        if not b or b.startswith("#") or b.startswith("|") or b.startswith("- ") or b.startswith("* ") or re.match(r"^\d+[.)]\s", b) or b.startswith("```"):
            continue
        out.append(b)
    return out


def readability_metrics(markdown: str) -> dict[str, Any]:
    paragraphs = _paragraphs(markdown)
    sentences = _sentences(markdown)
    words = word_count(MARKER.sub("", markdown))
    long_paras = [p for p in paragraphs if word_count(p) > 60]
    avg_sentence = round(sum(word_count(s) for s in sentences) / len(sentences), 1) if sentences else 0.0
    headings = HEADING.findall(markdown)
    h2 = [h for lvl, h in headings if len(lvl) == 2]
    question_h2 = [h for h in h2 if h.strip().endswith("?")]
    list_lines = len(re.findall(r"^\s*([-*]|\d+[.)])\s+", markdown, re.M))
    tables = len(re.findall(r"^\|.+\|\s*$", markdown, re.M))

    # Sections that open with a bold takeaway.
    sections = re.split(r"^##\s+.+$", markdown, flags=re.M)[1:]
    with_bold = sum(1 for s in sections if BOLD_LEAD.match(s.strip("\n ")))

    problems: list[str] = []
    for p in long_paras[:6]:
        problems.append(f"Paragraph over 60 words ({word_count(p)}): \"{p[:70]}…\"")
    if avg_sentence > 22:
        problems.append(f"Average sentence length is {avg_sentence} words; target under 20.")
    if sections and with_bold < len(sections):
        problems.append(f"{len(sections) - with_bold} of {len(sections)} sections do not open with a bold takeaway sentence.")
    if len(h2) < 3:
        problems.append(f"Only {len(h2)} H2 headings; aim for 4 to 7.")
    if list_lines == 0 and tables == 0:
        problems.append("No lists or tables at all; list-shaped content should be bulleted.")
    if EM_DASH.search(markdown):
        problems.append("Contains em dashes; replace with commas or full stops.")

    return {
        "words": words,
        "paragraphs": len(paragraphs),
        "long_paragraphs": len(long_paras),
        "avg_sentence_words": avg_sentence,
        "h2_count": len(h2),
        "question_headings": len(question_h2),
        "sections_with_bold_takeaway": with_bold,
        "sections": len(sections),
        "list_lines": list_lines,
        "table_rows": tables,
        "reading_minutes": max(1, round(words / 220)),
        "problems": problems,
    }


def quality_gate(
    *,
    title: str,
    markdown: str,
    meta_description: str,
    pack: FactPack,
    fact_check: FactCheckReport,
    min_words: int,
    contact_url: str,
    require_faq: bool = True,
    banned_terms: list[str] | None = None,
) -> QualityReport:
    failures: list[QualityFailure] = []
    warnings: list[str] = []
    full = f"{title}\n\n{meta_description}\n\n{markdown}"

    for pattern, label in SUPERLATIVES:
        if pattern.search(full):
            failures.append(QualityFailure(code="prohibited_superlative", message=f"Contains {label}. Remove it or add an approved claim entry that authorises this exact wording."))

    # Terms the site must never print (marketing_sites.banned_terms): a
    # regulator the brand is not licensed by, an old brand name, a competitor.
    for term in banned_terms or []:
        t = term.strip()
        if t and re.search(r"(?<![A-Za-z0-9])" + re.escape(t) + r"(?![A-Za-z0-9])", full, re.I):
            failures.append(QualityFailure(code="prohibited_term", message=f"Contains \"{t}\", which this site must not mention."))

    # Fact markers belong in the body only. One reached a published title on
    # 1 Oct 2026 ("... Triples Response Speeds [F2][F3]").
    if MARKER.search(title) or MARKER.search(meta_description):
        failures.append(QualityFailure(code="marker_in_metadata", message="The title or meta description contains a fact marker such as [F2]. Markers belong in the body only."))

    known = {f.id for f in pack.facts}
    unknown_markers = sorted({f"F{m}" for m in MARKER.findall(markdown) if f"F{m}" not in known})
    if unknown_markers:
        failures.append(QualityFailure(code="unknown_fact_marker", message=f"Cites fact ids that do not exist: {', '.join(unknown_markers)}."))

    # A numeric or currency claim must carry a marker in the same sentence.
    for sentence in re.split(r"(?<=[.!?])\s+", markdown):
        if NUMERIC_CLAIM.search(sentence) and not MARKER.search(sentence) and not sentence.strip().startswith("|"):
            failures.append(QualityFailure(code="unsupported_numeric_claim", message=f"Numeric or price claim without a fact marker: \"{sentence.strip()[:90]}…\""))
            if len([f for f in failures if f.code == "unsupported_numeric_claim"]) >= 5:
                break

    counts = fact_check.counts()
    if counts.get("unsupported", 0) or counts.get("contradicted", 0):
        failures.append(QualityFailure(code="fact_check_failed", message=f"Fact check still reports {counts.get('unsupported', 0)} unsupported and {counts.get('contradicted', 0)} contradicted claims."))
    if counts.get("needs_verification", 0):
        warnings.append(f"{counts['needs_verification']} claim(s) rest on draft knowledge entries. Mark those entries verified, or edit the claims, before publishing.")

    words = word_count(MARKER.sub("", markdown))
    if words < min_words:
        failures.append(QualityFailure(code="thin_content", message=f"Only {words} words; the minimum is {min_words}."))

    seen: set[str] = set()
    for p in _paragraphs(markdown):
        key = p.lower()
        if len(key) > 40 and key in seen:
            failures.append(QualityFailure(code="duplicate_paragraph", message=f"Duplicate paragraph: \"{p[:60]}…\""))
            break
        seen.add(key)

    metrics = readability_metrics(markdown)
    if metrics["long_paragraphs"] > max(2, metrics["paragraphs"] // 5):
        failures.append(QualityFailure(code="not_scannable", message=f"{metrics['long_paragraphs']} paragraphs are over 60 words."))
    if metrics["h2_count"] < 3:
        failures.append(QualityFailure(code="structure", message=f"Only {metrics['h2_count']} H2 headings."))
    if metrics["question_headings"] < 1:
        warnings.append("No heading is phrased as a question; AI answer engines match question headings well.")

    if contact_url and contact_url not in markdown:
        failures.append(QualityFailure(code="missing_cta", message="No call to action linking to the contact URL."))
    if require_faq and not re.search(r"^##\s+(FAQ|Frequently asked|Pertanyaan)", markdown, re.I | re.M):
        warnings.append("No FAQ section found.")
    if not (30 <= len(title) <= 70):
        warnings.append(f"Title is {len(title)} characters; 30 to 70 reads best.")
    if not (100 <= len(meta_description) <= 165):
        warnings.append(f"Meta description is {len(meta_description)} characters; 120 to 160 is the target.")

    metrics["groundedness"] = fact_check.groundedness()
    metrics["claims"] = counts
    return QualityReport(passed=not failures, failures=failures, warnings=warnings, metrics=metrics)
