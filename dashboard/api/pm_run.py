"""Vercel Python function — RUN an insurer's real Excel calculator.

POST /api/pm_run
  body: {
    "xlsx_url": "<signed Supabase Storage URL>",
    "profile":  <CellMapProfile>,          # which cells are inputs/outputs (see pm-profile.ts)
    "members":  [ {name, category, relationship, date_of_birth|age, occupation_class,
                   coverage: { HS:{plan,hospital,beds,coinsurance}, OPGP:{plan}, ... }}, ... ],
    "globals":  { effective_date, ... }    # optional per-quote inputs
  }
  -> { ok, members:[{row, name, age, lines:{code:premium}}], totals:{by_line, grand}, warnings }

This does NOT extract or re-derive any pricing. It writes the census into the workbook's own
input cells and evaluates the workbook's real formula graph with the `formulas` engine, then
reads the premium/total cells back. The insurer's own formulas produce every number.

Gotchas (proven in the 2026-07-22 spike):
  - address format is  '[<filename>]<SHEET-UPPER>'!<CELL>  — filename keeps original case,
    sheet name is UPPERCASED.
  - dates MUST be Excel serial numbers (days since 1899-12-30), NOT python datetimes, or
    DATEDIF() returns #VALUE!.
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import tempfile
import urllib.request
from http.server import BaseHTTPRequestHandler

# `formulas` is heavy (pulls numpy/scipy/schedula). Imported lazily inside the handler so a
# GET health-check still works even if the import is slow/unavailable.
BOOK = "wb.xlsx"          # we save the workbook under a fixed name → deterministic addresses
_EPOCH = _dt.date(1899, 12, 30)


def _serial(d: _dt.date) -> int:
    return (d - _EPOCH).days


def _parse_date(v):
    if isinstance(v, (_dt.datetime, _dt.date)):
        return v if isinstance(v, _dt.date) and not isinstance(v, _dt.datetime) else v.date()
    if isinstance(v, str) and v.strip():
        s = v.strip()[:10]
        try:
            return _dt.date.fromisoformat(s)
        except ValueError:
            return None
    return None


def _addr(sheet: str, cell: str) -> str:
    return f"'[{BOOK}]{sheet.upper()}'!{cell}"


def _coerce(value):
    """Normalise a census value for a workbook cell. '20%' -> 0.2 ; leave the rest as-is."""
    if isinstance(value, str):
        s = value.strip()
        if s.endswith("%"):
            try:
                return float(s[:-1]) / 100.0
            except ValueError:
                return s
    return value


def _scalar(obj):
    """Pull a plain python scalar out of a formulas Ranges/Array/XlError result."""
    try:
        v = obj.value
    except AttributeError:
        v = obj
    # numpy array -> first element
    try:
        v = v[0, 0]
    except Exception:
        try:
            v = v[0]
        except Exception:
            pass
    if v is None:
        return None
    s = str(v)
    if s == "" or s.startswith("#"):   # "" (empty) or an Excel error like #VALUE!
        return None
    try:
        f = float(v)
        return round(f, 2)
    except (TypeError, ValueError):
        return s


def run_calculator(data: bytes, profile: dict, members: list, globals_in: dict | None = None) -> dict:
    import formulas  # lazy

    sheet = profile["sheet"]
    row0 = int(profile["rows"]["start"])
    row_end = int(profile["rows"]["end"])
    mi = profile.get("member_inputs", {}) or {}
    lines = profile.get("coverage_lines", []) or []
    date_serial = profile.get("date_serial", True)
    warnings: list[str] = []

    tmpdir = tempfile.mkdtemp()
    path = os.path.join(tmpdir, BOOK)
    with open(path, "wb") as fh:
        fh.write(data)

    xl = formulas.ExcelModel().loads(path).finish()

    inputs: dict = {}

    def put(cell, value):
        if value is None or value == "":
            return
        inputs[_addr(sheet, cell)] = value

    # Global (per-quote) single-cell inputs.
    for field, cell in (profile.get("globals") or {}).items():
        gv = (globals_in or {}).get(field)
        if gv is None:
            continue
        d = _parse_date(gv)
        put_cell = cell  # globals are absolute cells already (e.g. "F4")
        inputs[_addr(sheet, put_cell)] = _serial(d) if (d and date_serial) else _coerce(gv)

    # A default policy effective date applied to every life when the member row has none.
    default_eff = _parse_date((globals_in or {}).get("effective_date"))

    placed = []
    for i, m in enumerate(members):
        r = row0 + i
        if r > row_end:
            warnings.append(f"census has more members ({len(members)}) than workbook rows "
                            f"({row_end - row0 + 1}); extra members were dropped")
            break

        # Per-life scalar inputs.
        if mi.get("name"):
            put(f"{mi['name']}{r}", m.get("name"))
        if mi.get("category"):
            put(f"{mi['category']}{r}", m.get("category"))
        if mi.get("relationship"):
            put(f"{mi['relationship']}{r}", m.get("relationship"))
        if mi.get("occupation_class"):
            put(f"{mi['occupation_class']}{r}", m.get("occupation_class"))

        # Effective / expiry dates.
        eff = _parse_date(m.get("policy_effective_date")) or default_eff
        if mi.get("policy_effective_date") and eff:
            put(f"{mi['policy_effective_date']}{r}", _serial(eff) if date_serial else eff.isoformat())
        exp = _parse_date(m.get("policy_expiry_date"))
        if mi.get("policy_expiry_date") and exp:
            put(f"{mi['policy_expiry_date']}{r}", _serial(exp) if date_serial else exp.isoformat())

        # Date of birth — the workbook computes age from it. Synthesise from `age` if needed.
        dob = _parse_date(m.get("date_of_birth"))
        if dob is None and m.get("age") is not None and eff is not None:
            try:
                dob = _dt.date(eff.year - int(m["age"]), 1, 1)
            except (ValueError, TypeError):
                dob = None
        if mi.get("date_of_birth") and dob:
            put(f"{mi['date_of_birth']}{r}", _serial(dob) if date_serial else dob.isoformat())

        # Per-coverage plan-selection inputs.
        cov = m.get("coverage", {}) or {}
        for line in lines:
            code = line["code"]
            sel = cov.get(code, {}) or {}
            for field, col in (line.get("inputs") or {}).items():
                if field in sel and sel[field] not in (None, ""):
                    put(f"{col}{r}", _coerce(sel[field]))

        placed.append((r, m.get("name")))

    # `per_life_total` (optional): a single per-life total column on the driving sheet, used when the
    # workbook has no per-coverage-line outputs there (e.g. premiums live on a hidden/other sheet).
    plt = profile.get("per_life_total")

    # Outputs: per-life premium cells (+ per-life total), plus totals.
    outputs = []
    for (r, _name) in placed:
        for line in lines:
            if line.get("output"):
                outputs.append(_addr(sheet, f"{line['output']}{r}"))
        if plt:
            outputs.append(_addr(sheet, f"{plt}{r}"))
    totals = profile.get("totals", {}) or {}
    for _code, cell in (totals.get("by_line") or {}).items():
        outputs.append(_addr(sheet, cell))
    if totals.get("grand"):
        outputs.append(_addr(sheet, totals["grand"]))

    sol = xl.calculate(inputs=inputs, outputs=outputs)

    def read(cell):
        return _scalar(sol.get(_addr(sheet, cell)))

    # Optional GST net-down: the workbook total includes GST but we want net premiums.
    try:
        gst_div = float(profile.get("total_gst_divisor") or 0)
    except (TypeError, ValueError):
        gst_div = 0.0
    net = (lambda v: round(v / gst_div, 2) if (gst_div > 1 and isinstance(v, (int, float))) else v)

    out_members = []
    for (r, name) in placed:
        line_vals = {line["code"]: net(read(f"{line['output']}{r}")) for line in lines if line.get("output")}
        life_total = read(f"{plt}{r}") if plt else None
        # Prefer the workbook's own per-life total; else sum the per-line premiums we read.
        if isinstance(life_total, (int, float)):
            subtotal = net(round(life_total, 2))
        else:
            subtotal = round(sum(v for v in line_vals.values() if isinstance(v, (int, float))), 2)
        out_members.append({"row": r, "name": name, "lines": line_vals, "subtotal": subtotal})

    # by_line cells are absolute (e.g. "N116"); read directly.
    by_line = {code: net(read(cell)) for code, cell in (totals.get("by_line") or {}).items()}
    grand = net(read(totals["grand"])) if totals.get("grand") else None
    # Fallback: no grand-total cell in the workbook → sum the (already net) per-life totals.
    if grand is None and out_members:
        grand = round(sum(m["subtotal"] for m in out_members if isinstance(m["subtotal"], (int, float))), 2)

    return {
        "ok": True,
        "members": out_members,
        "totals": {"by_line": by_line, "grand": grand},
        "warnings": warnings,
    }


# ── Vercel handler ────────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        ok = True
        detail = "formulas import ok"
        try:
            import formulas  # noqa: F401
        except Exception as e:  # noqa: BLE001
            ok, detail = False, f"{type(e).__name__}: {e}"
        self._send(200, {"ok": ok, "service": "pm_run", "engine": detail,
                         "usage": "POST { xlsx_url, profile, members, globals? }"})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
            url = payload.get("xlsx_url")
            profile = payload.get("profile")
            if not url or not profile:
                return self._send(400, {"error": "xlsx_url and profile required"})
            with urllib.request.urlopen(url, timeout=30) as resp:  # noqa: S310 (trusted signed URL)
                data = resp.read()
            result = run_calculator(data, profile, payload.get("members", []), payload.get("globals"))
            self._send(200, result)
        except Exception as e:  # noqa: BLE001
            self._send(500, {"error": f"{type(e).__name__}: {e}"})
