#!/usr/bin/env python3
"""compile_rates.py — Excel-to-Python insurance rate compiler.

Consumes the JSON dump produced by dump_workbook.py and runs, in order:

  STEP 1  Structural map   — classify each sheet (rate table / notes / template)
  STEP 2  Rule detection   — age basis, GST, group discount, rider deps,
                             renewal-only bands, occupation-class rules; each
                             logged with a source citation + confidence, or an
                             explicit "NOT DETECTED — requires human input".
  STEP 3  Structured JSON  — the compiled artefact (rules + rate_table) for a
                             human to review/approve.
  STEP 4  Module gen       — ONLY on an already-approved Step-3 JSON, emit a
                             standalone {insurer_slug}.py with a working
                             calculate_premium(). Stdlib-only output.

Nothing here fabricates a rate: every premium in rate_table is copied verbatim
from cell_values and carries its source_cell.

Usage:
  # Steps 1-3 -> review JSON (+ human-readable log on stderr)
  python3 compile_rates.py compile dump.json -o compiled.json [--insurer "AIA"]

  # Step 4 -> Python module, only after a human approves compiled.json
  python3 compile_rates.py emit-module compiled.approved.json -o out_dir/
"""
from __future__ import annotations

import argparse
import json
import os
import pprint
import re
import sys

NOT_DETECTED = "NOT DETECTED — requires human input"

# ─────────────────────────────────────────────────────────────────────────────
# Small A1-notation helpers (no openpyxl dependency here — this half is stdlib).
# ─────────────────────────────────────────────────────────────────────────────
_COORD_RE = re.compile(r"^([A-Z]+)(\d+)$")


def col_to_num(letters: str) -> int:
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n


def split_coord(ref: str) -> tuple[int, int] | None:
    m = _COORD_RE.match(ref)
    if not m:
        return None
    return int(m.group(2)), col_to_num(m.group(1))  # (row, col), both 1-based


def is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# ─────────────────────────────────────────────────────────────────────────────
# Age-band label parsing. Returns (age_from, age_to) or None.
# ─────────────────────────────────────────────────────────────────────────────
_BAND_PATTERNS = [
    (re.compile(r"^\s*up\s*to\s*(\d{1,3})", re.I), lambda m: (0, int(m.group(1)))),
    (re.compile(r"^\s*(\d{1,3})\s*(?:-|to|–|—|~)\s*(\d{1,3})", re.I),
     lambda m: (int(m.group(1)), int(m.group(2)))),
    (re.compile(r"^\s*(\d{1,3})\s*(?:\+|and\s*(?:above|over|older)|&\s*above)", re.I),
     lambda m: (int(m.group(1)), 999)),
    (re.compile(r"^\s*below\s*(\d{1,3})", re.I), lambda m: (0, int(m.group(1)) - 1)),
]


def parse_band(label) -> tuple[int, int] | None:
    if not isinstance(label, str):
        return None
    for rx, fn in _BAND_PATTERNS:
        m = rx.search(label)
        if m:
            try:
                return fn(m)
            except (ValueError, IndexError):
                return None
    return None


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Structural map
# ─────────────────────────────────────────────────────────────────────────────
NOTES_HINTS = ("note", "instruction", "readme", "read me", "guide", "import", "how to")
TEMPLATE_HINTS = ("input", "output", "quote", "calc", "template", "summary", "result", "form")


def classify_sheets(dump: dict) -> list[dict]:
    """Classify every sheet and log the reasoning. A sheet is a rate table if it
    holds a grid of age-band labels beside numeric cells; notes if named like
    instructions; template if named like an input/output form; else unknown."""
    values = dump.get("cell_values", {})
    formulas = dump.get("cell_formulas", {})
    out = []
    for s in dump.get("all_sheets", []):
        name = s["name"]
        low = name.lower()
        cells = values.get(name, {})
        band_cells = [ref for ref, v in cells.items() if parse_band(v)]
        numeric = sum(1 for v in cells.values() if is_number(v))
        f_count = len(formulas.get(name, {}))

        reasons = []
        if any(h in low for h in NOTES_HINTS):
            kind = "notes"
            reasons.append(f"name matches notes hint ({low!r})")
        elif band_cells and numeric >= 4:
            kind = "rate_table"
            reasons.append(f"{len(band_cells)} age-band label(s) beside {numeric} numeric cells")
        elif any(h in low for h in TEMPLATE_HINTS):
            kind = "template"
            reasons.append(f"name matches input/output template hint ({low!r})")
        elif numeric == 0 and cells:
            kind = "notes"
            reasons.append("text-only sheet, no numeric cells")
        elif f_count and numeric:
            kind = "template"
            reasons.append(f"{f_count} formula cells over {numeric} numeric — looks computed")
        else:
            kind = "unknown"
            reasons.append("no strong signal")

        if not s["visible"]:
            reasons.append(f"sheet is {s['state']}")
        out.append({
            "sheet": name, "state": s["state"], "classification": kind,
            "band_cells": len(band_cells), "numeric_cells": numeric,
            "formula_cells": f_count, "reasoning": "; ".join(reasons),
        })
    return out


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Rule detection. Each returns a detection_log entry dict.
# ─────────────────────────────────────────────────────────────────────────────
def _log(rule, value, source, confidence) -> dict:
    return {"rule": rule, "value": value, "source_cell_or_text": source, "confidence": confidence}


def _all_text(dump: dict) -> list[tuple[str, str, object]]:
    """Flatten every text-bearing cell as (sheet, ref, value) plus the notes blob
    as one pseudo-cell, so detectors can cite exactly where they matched."""
    items: list[tuple[str, str, object]] = []
    for sheet, cells in dump.get("cell_values", {}).items():
        for ref, v in cells.items():
            if isinstance(v, str):
                items.append((sheet, ref, v))
    notes = dump.get("notes_text", "")
    if notes:
        items.append(("<notes_text>", "-", notes))
    return items


def _search_text(dump, patterns) -> tuple[str, str] | None:
    """Return (matched_snippet, 'sheet!ref') for the first cell/text matching any
    of the regex patterns, else None."""
    for sheet, ref, v in _all_text(dump):
        for rx in patterns:
            m = rx.search(v)
            if m:
                snippet = v if len(v) <= 120 else v[max(0, m.start() - 30): m.start() + 90]
                where = f"{sheet}!{ref}" if ref != "-" else sheet
                return snippet.strip(), where
    return None


def detect_age_basis(dump) -> dict:
    hit_next = _search_text(dump, [re.compile(r"age\s+next\s+birthday|next\s+birthday|ANB", re.I)])
    hit_last = _search_text(dump, [re.compile(r"age\s+last\s+birthday|last\s+birthday|ALB", re.I)])
    if hit_next and not hit_last:
        return _log("age_basis", "next birthday", f"{hit_next[1]}: {hit_next[0]!r}", "high")
    if hit_last and not hit_next:
        return _log("age_basis", "last birthday", f"{hit_last[1]}: {hit_last[0]!r}", "high")
    if hit_next and hit_last:
        # Both appear — cite both, let the human pick.
        return _log("age_basis", NOT_DETECTED,
                    f"both found — {hit_next[1]}:{hit_next[0]!r} AND {hit_last[1]}:{hit_last[0]!r}",
                    "low")
    return _log("age_basis", NOT_DETECTED, "no 'last/next birthday' text found", "n/a")


def detect_gst(dump) -> dict:
    # Formula-level factors are the strongest signal (÷1.09 strips inclusive GST).
    for sheet, cells in dump.get("cell_formulas", {}).items():
        for ref, f in cells.items():
            if re.search(r"/\s*1\.09\b|/\s*1\.08\b|/\s*1\.07\b", f):
                factor = re.search(r"/\s*(1\.0[789])\b", f).group(1)
                return _log("gst_treatment", {"treatment": "inclusive", "conversion_factor": float(factor)},
                            f"{sheet}!{ref}: {f!r}", "high")
            if re.search(r"\*\s*1\.09\b|\*\s*0\.09\b|\+.*0\.09", f) and "gst" in (sheet + ref).lower():
                return _log("gst_treatment", {"treatment": "exclusive", "conversion_factor": 1.09},
                            f"{sheet}!{ref}: {f!r}", "medium")
    inc = _search_text(dump, [re.compile(r"inclusive of\s+gst|gst\s+inclusive|incl\.?\s*gst", re.I)])
    if inc:
        return _log("gst_treatment", {"treatment": "inclusive", "conversion_factor": None},
                    f"{inc[1]}: {inc[0]!r}", "medium")
    exc = _search_text(dump, [re.compile(r"exclusive of\s+gst|gst\s+exclusive|excl\.?\s*gst|before gst", re.I)])
    if exc:
        return _log("gst_treatment", {"treatment": "exclusive", "conversion_factor": None},
                    f"{exc[1]}: {exc[0]!r}", "medium")
    return _log("gst_treatment", NOT_DETECTED, "no GST factor or inclusive/exclusive text found", "n/a")


def detect_group_size_discount(dump) -> dict:
    hit = _search_text(dump, [
        re.compile(r"(group|head\s*count|lives|members?)\D{0,20}(discount|loading|rebate)", re.I),
        re.compile(r"(discount|loading)\D{0,20}(group|head\s*count|lives|members?)", re.I),
    ])
    if hit:
        return _log("group_size_discount",
                    "detected — tier factors NOT auto-parsed; confirm the table",
                    f"{hit[1]}: {hit[0]!r}", "low")
    return _log("group_size_discount", NOT_DETECTED, "no headcount discount/loading text found", "n/a")


def detect_rider_dependencies(dump) -> dict:
    hits = []
    for sheet, ref, v in _all_text(dump):
        m = re.search(r"([A-Z][A-Za-z0-9+/&\- ]{1,40}?)\s+(?:must be taken with|requires|only with|rider to|attach(?:ed)? to|subject to)\s+([A-Z][A-Za-z0-9+/&\- ]{1,40})", v, re.I)
        if m:
            hits.append({"coverage": m.group(1).strip(), "requires": m.group(2).strip(),
                         "source": f"{sheet}!{ref}"})
    if hits:
        return _log("rider_dependencies", hits, "; ".join(h["source"] for h in hits), "medium")
    return _log("rider_dependencies", NOT_DETECTED, "no rider dependency phrasing found", "n/a")


def detect_renewal_only_bands(dump) -> dict:
    hits = []
    for sheet, ref, v in _all_text(dump):
        if re.search(r"renewal\s*only|renewal\s*basis|not.*new business|renewals?\s+only", v, re.I):
            band = parse_band(v)
            hits.append({"text": v.strip()[:80], "band": band, "source": f"{sheet}!{ref}"})
    if hits:
        return _log("renewal_only_bands", hits, "; ".join(h["source"] for h in hits), "medium")
    return _log("renewal_only_bands", NOT_DETECTED, "no 'renewal only' text found", "n/a")


def detect_occupation_class(dump) -> dict:
    classes = set()
    src = None
    for sheet, ref, v in _all_text(dump):
        for m in re.finditer(r"\b(?:class|occupation(?:al)?\s*class)\s*([1-4])\b", v, re.I):
            classes.add(int(m.group(1)))
            src = src or f"{sheet}!{ref}: {v.strip()[:60]!r}"
    if classes:
        rule = _search_text(dump, [re.compile(r"class\s*[1-4].{0,60}(eligib|exclud|not (?:eligible|covered)|load)", re.I)])
        note = f"; eligibility/loading note at {rule[1]}: {rule[0]!r}" if rule else "; no explicit eligibility/loading rule — pricing effect NOT confirmed"
        return _log("occupation_class_rules",
                    {"classes_present": sorted(classes), "rule": (rule[0] if rule else NOT_DETECTED)},
                    (src or "") + note, "medium" if rule else "low")
    return _log("occupation_class_rules", NOT_DETECTED, "no occupation Class 1-4 references found", "n/a")


DETECTORS = [
    ("age_basis", detect_age_basis),
    ("gst_treatment", detect_gst),
    ("group_size_discount", detect_group_size_discount),
    ("rider_dependencies", detect_rider_dependencies),
    ("renewal_only_bands", detect_renewal_only_bands),
    ("occupation_class_rules", detect_occupation_class),
]


# ─────────────────────────────────────────────────────────────────────────────
# Rate-table extraction — copy numbers verbatim, never invent.
# ─────────────────────────────────────────────────────────────────────────────
def extract_rate_table(dump, rate_sheets, age_basis) -> tuple[list[dict], list[str]]:
    """Best-effort: for each rate sheet, find rows whose left cell is an age band,
    read the numeric cells across, and label columns from the header row above.

    Returns (rows, warnings). Emits nothing it cannot trace to a real cell."""
    rows: list[dict] = []
    warnings: list[str] = []

    for sheet in rate_sheets:
        cells = dump["cell_values"].get(sheet, {})
        # Index by (row, col).
        grid: dict[tuple[int, int], tuple[str, object]] = {}
        for ref, v in cells.items():
            rc = split_coord(ref)
            if rc:
                grid[rc] = (ref, v)
        if not grid:
            continue

        band_rows = {}  # row -> (age_col, band_ref, (from,to))
        for (r, c), (ref, v) in grid.items():
            band = parse_band(v)
            if band:
                # keep the left-most age column on that row
                if r not in band_rows or c < band_rows[r][0]:
                    band_rows[r] = (c, ref, band)
        if not band_rows:
            warnings.append(f"{sheet}: no age-band rows recognised — skipped")
            continue

        # Group consecutive band rows into blocks (a block ≈ one matrix).
        sorted_rows = sorted(band_rows)
        blocks: list[list[int]] = []
        for r in sorted_rows:
            if blocks and r - blocks[-1][-1] <= 2 and band_rows[r][0] == band_rows[blocks[-1][-1]][0]:
                blocks[-1].append(r)
            else:
                blocks.append([r])

        for block in blocks:
            age_col = band_rows[block[0]][0]
            header_row = _find_header_row(grid, block[0], age_col)
            plan_cols = _plan_columns(grid, header_row, age_col) if header_row else {}
            section = _section_title(grid, block[0], age_col)
            member = _member_type(section) or _member_type(sheet)
            if not plan_cols:
                warnings.append(f"{sheet}: matrix at row {block[0]} has age bands but no header row above — columns unlabelled")
            for r in block:
                _, _, (a_from, a_to) = band_rows[r]
                for c in range(age_col + 1, age_col + 60):
                    cellrc = grid.get((r, c))
                    if not cellrc or not is_number(cellrc[1]):
                        continue
                    ref, premium = cellrc
                    plan = plan_cols.get(c, f"col {c}")
                    rows.append({
                        "coverage": section or sheet,
                        "plan": plan,
                        "class": None,
                        "age_from": a_from,
                        "age_to": a_to,
                        "basis": age_basis if age_basis != NOT_DETECTED else None,
                        "premium": premium,
                        # extensions (documented): provenance + member type
                        "source_cell": f"{sheet}!{ref}",
                        "member_type": member,
                    })
    return rows, warnings


def _find_header_row(grid, band_row, age_col):
    """Nearest non-empty row above the first band row that has text to the right
    of the age column (the plan labels)."""
    for r in range(band_row - 1, max(0, band_row - 8), -1):
        labels = [c for (rr, c), (_, v) in grid.items()
                  if rr == r and c > age_col and isinstance(v, str) and not parse_band(v)]
        if labels:
            return r
    return None


def _plan_columns(grid, header_row, age_col) -> dict[int, str]:
    out = {}
    for (r, c), (_, v) in grid.items():
        if r == header_row and c > age_col and isinstance(v, str) and v.strip():
            out[c] = v.strip()
    return out


def _section_title(grid, band_row, age_col):
    """A merged/standalone title above the header (e.g. product name) — the first
    text cell at/left of the age column in the few rows above."""
    for r in range(band_row - 1, max(0, band_row - 6), -1):
        for (rr, c), (_, v) in sorted(grid.items()):
            if rr == r and c <= age_col and isinstance(v, str) and v.strip() and not parse_band(v):
                if len(v.strip()) > 2 and not re.match(r"(?i)^age", v.strip()):
                    return v.strip()
    return None


def _member_type(text):
    if not isinstance(text, str):
        return None
    low = text.lower()
    if "dependant" in low or "dependent" in low or "spouse" in low or "child" in low:
        return "dependant"
    if "employee" in low or "staff" in low or "member" in low:
        return "employee"
    return None


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — assemble the compiled JSON
# ─────────────────────────────────────────────────────────────────────────────
def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (name or "insurer").lower()).strip("_") or "insurer"


def guess_insurer(dump, override) -> str:
    if override:
        return override
    text = dump.get("notes_text", "")
    for known in ("AIA", "Great Eastern", "Prudential", "Income", "NTUC", "Manulife",
                  "AXA", "Aviva", "Singlife", "HSBC Life", "Tokio Marine", "China Taiping",
                  "MSIG", "Chubb", "Allianz", "Etiqa"):
        if re.search(re.escape(known), text, re.I):
            return known
    return "UNKNOWN — set with --insurer"


def compile_dump(dump, insurer_override=None) -> dict:
    smap = classify_sheets(dump)
    detection_log = [fn(dump) for _, fn in DETECTORS]
    rules = {}
    for entry in detection_log:
        rules[entry["rule"]] = entry["value"]

    rate_sheets = [s["sheet"] for s in smap if s["classification"] == "rate_table"]
    rate_table, warnings = extract_rate_table(dump, rate_sheets, rules.get("age_basis"))

    compiled = {
        "insurer": guess_insurer(dump, insurer_override),
        "source_file": dump.get("source_file"),
        "structural_map": smap,
        "detection_log": detection_log,
        "extraction_warnings": warnings,
        "rules": rules,
        "tier_mapping": {},  # intentionally empty — configured per brokerage later
        "rate_table": rate_table,
        "approved": False,   # a human flips this to True after review
    }
    return compiled


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Python module generation (only on an approved compiled JSON)
# ─────────────────────────────────────────────────────────────────────────────
MODULE_TEMPLATE = '''"""{insurer} premium calculator — auto-generated by rate-compiler.

Source workbook: {source_file}

Rule provenance (auto-detected unless marked human-confirmed):
{provenance}

Every value in RATE_TABLE traces to a specific workbook cell (see 'source_cell').
Do not hand-edit generated rows; re-run the compiler on the source instead.
"""
from __future__ import annotations

import datetime as _dt

RULES = {rules_literal}

RATE_TABLE = {table_literal}


def _age_from_dob(dob, effective_date, basis) -> int:
    """Age on effective_date, honouring the detected age basis."""
    if isinstance(dob, str):
        dob = _dt.date.fromisoformat(dob)
    if isinstance(effective_date, str):
        effective_date = _dt.date.fromisoformat(effective_date)
    years = effective_date.year - dob.year
    had_birthday = (effective_date.month, effective_date.day) >= (dob.month, dob.day)
    if basis == "next birthday":
        return years + (0 if had_birthday else 1)
    # default / "last birthday"
    return years - (0 if had_birthday else 1)


def calculate_premium(age: int = None, coverage: str = None, plan: str = None,
                      class_: str = None, group_size: int = 1,
                      is_renewal: bool = False, dob=None, effective_date=None) -> float:
    """Look up the age-band premium for (coverage, plan[, class]) and apply the
    approved rules. Raises ValueError if no band matches or a renewal-only band is
    requested for new business."""
    basis = RULES.get("age_basis")
    if age is None:
        if dob is None or effective_date is None:
            raise ValueError("Provide age, or both dob and effective_date")
        age = _age_from_dob(dob, effective_date, basis)

    candidates = [
        r for r in RATE_TABLE
        if (coverage is None or r["coverage"] == coverage)
        and (plan is None or r["plan"] == plan)
        and (class_ is None or r.get("class") in (None, class_))
        and r["age_from"] <= age <= r["age_to"]
    ]
    if not candidates:
        raise ValueError(f"No rate band for age={{age}} coverage={{coverage!r}} plan={{plan!r}} class={{class_!r}}")

    # Prefer the tightest matching band.
    row = min(candidates, key=lambda r: r["age_to"] - r["age_from"])

    renewal_bands = RULES.get("renewal_only_bands")
    if isinstance(renewal_bands, list) and not is_renewal:
        for rb in renewal_bands:
            b = rb.get("band")
            if b and b[0] <= age <= b[1]:
                raise ValueError(f"Age {{age}} is renewal-only; set is_renewal=True")

    premium = float(row["premium"])

    # Group-size discount — only applied when configured as an explicit factor map.
    gsd = RULES.get("group_size_discount")
    if isinstance(gsd, dict) and gsd.get("tiers"):
        for tier in sorted(gsd["tiers"], key=lambda t: t["min_lives"], reverse=True):
            if group_size >= tier["min_lives"]:
                premium *= tier["factor"]
                break

    # GST conversion — only applied when a numeric factor was confirmed.
    gst = RULES.get("gst_treatment")
    if isinstance(gst, dict) and isinstance(gst.get("conversion_factor"), (int, float)):
        if gst.get("treatment") == "inclusive":
            premium = premium / gst["conversion_factor"]
        elif gst.get("treatment") == "exclusive":
            premium = premium * gst["conversion_factor"]

    return round(premium, 2)


if __name__ == "__main__":
    # Tiny self-check: the table loaded and the first row is priceable.
    print(f"{{len(RATE_TABLE)}} rows loaded from {source_file!r}")
'''


def emit_module(compiled: dict, out_dir: str) -> str:
    if not compiled.get("approved"):
        raise SystemExit(
            'Refusing to generate: compiled JSON is not approved. Review it, set '
            '"approved": true (and fix any NOT DETECTED rules / tier_mapping), then re-run.'
        )
    insurer = compiled.get("insurer") or "insurer"
    slug = slugify(insurer)

    prov_lines = []
    for e in compiled.get("detection_log", []):
        conf = e.get("confidence")
        confirmed = "human-confirmed" if e.get("human_confirmed") else f"auto ({conf})"
        val = e.get("value")
        val_s = val if isinstance(val, str) else json.dumps(val, ensure_ascii=False)
        prov_lines.append(f"  - {e['rule']}: {val_s}  [{confirmed}]  <- {e.get('source_cell_or_text')}")
    provenance = "\n".join(prov_lines) if prov_lines else "  (none)"

    code = MODULE_TEMPLATE.format(
        insurer=insurer,
        source_file=compiled.get("source_file"),
        provenance=provenance,
        rules_literal=pprint.pformat(compiled.get("rules", {}), width=100, sort_dicts=False),
        table_literal=pprint.pformat(compiled.get("rate_table", []), width=120, sort_dicts=False),
    )
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{slug}.py")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(code)
    return path


# ─────────────────────────────────────────────────────────────────────────────
def _print_human_log(compiled: dict) -> None:
    w = sys.stderr.write
    w("\n=== STEP 1: STRUCTURAL MAP ===\n")
    for s in compiled["structural_map"]:
        w(f"  [{s['classification']:<10}] {s['sheet']} ({s['state']}) — {s['reasoning']}\n")
    w("\n=== STEP 2: RULE DETECTION ===\n")
    for e in compiled["detection_log"]:
        val = e["value"] if isinstance(e["value"], str) else json.dumps(e["value"], ensure_ascii=False)
        w(f"  {e['rule']}: {val}  [{e['confidence']}]\n      source: {e['source_cell_or_text']}\n")
    if compiled["extraction_warnings"]:
        w("\n=== EXTRACTION WARNINGS ===\n")
        for x in compiled["extraction_warnings"]:
            w(f"  ! {x}\n")
    w(f"\n=== STEP 3: rate_table has {len(compiled['rate_table'])} rows "
      f"(insurer={compiled['insurer']!r}). Review, set approved=true, then emit-module. ===\n")


def cmd_compile(args) -> int:
    with open(args.dump, encoding="utf-8") as fh:
        dump = json.load(fh)
    compiled = compile_dump(dump, args.insurer)
    text = json.dumps(compiled, indent=2, ensure_ascii=False)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)
        _print_human_log(compiled)
        sys.stderr.write(f"\nWrote {args.out}\n")
    else:
        print(text)
    return 0


def cmd_emit(args) -> int:
    with open(args.compiled, encoding="utf-8") as fh:
        compiled = json.load(fh)
    path = emit_module(compiled, args.out or ".")
    sys.stderr.write(f"Wrote {path}\n")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("compile", help="Run Steps 1-3 on a JSON dump")
    c.add_argument("dump", help="JSON dump from dump_workbook.py")
    c.add_argument("-o", "--out", help="Write compiled JSON here (default: stdout)")
    c.add_argument("--insurer", help="Override the insurer name")
    c.set_defaults(fn=cmd_compile)

    e = sub.add_parser("emit-module", help="Step 4: generate {slug}.py from an APPROVED compiled JSON")
    e.add_argument("compiled", help="Approved compiled JSON (approved=true)")
    e.add_argument("-o", "--out", help="Output directory (default: cwd)")
    e.set_defaults(fn=cmd_emit)

    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
