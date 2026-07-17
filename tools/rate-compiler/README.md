# Rate Compiler — Excel → Python insurance premium modules

A standalone, offline pipeline that turns an insurer's Excel premium calculator
into an auditable Python module with a `calculate_premium(...)` function.

It runs **outside** the Next.js dashboard (no Supabase, no network). The only
third-party dependency is `openpyxl`, and only for the Excel dumper — the
compiler and every generated module are **standard-library only**.

## Why it's built in two halves

`openpyxl` can read formulas *or* cached values, and parsing Excel is messy. So
the flow is split so the messy part is isolated and the compiler stays pure/testable:

```
 calculator.xlsx ──[dump_workbook.py]──▶ dump.json ──[compile_rates.py compile]──▶ compiled.json
                                                                                        │
                                                        (human reviews, sets approved:true)
                                                                                        ▼
                                                    out/{insurer}.py  ◀──[compile_rates.py emit-module]
```

## Usage

```bash
python3 -m pip install -r requirements.txt        # for the dumper only

# 1. Dump the workbook to JSON (formulas + cached values + hidden sheets + notes)
python3 dump_workbook.py path/to/AIA_GroupRates_2026.xlsx -o dump.json

# 2. Steps 1-3: structural map + rule detection + compiled JSON.
#    A human-readable log prints to stderr; the artefact goes to compiled.json.
python3 compile_rates.py compile dump.json -o compiled.json --insurer "AIA"

# 3. REVIEW compiled.json. Fix any "NOT DETECTED — requires human input" rules,
#    fill tier_mapping if you use it, then set  "approved": true.

# 4. Step 4: generate the module (refuses unless approved:true)
python3 compile_rates.py emit-module compiled.json -o out/
#    -> out/aia.py  with RATE_TABLE, RULES, calculate_premium(...)
```

Then, from your own code:

```python
import aia
aia.calculate_premium(age=42, coverage="GHS+EMM FOR EMPLOYEE", plan="Plan 1")
aia.calculate_premium(dob="1994-08-01", effective_date="2026-07-01",
                      coverage="GHS+EMM FOR EMPLOYEE", plan="Plan 1")
```

## The four steps

**STEP 1 — Structural map.** Every sheet is classified `rate_table` /
`notes` / `template` / `unknown`, with the reasoning logged. Hidden and
`veryHidden` sheets are included and flagged.

**STEP 2 — Rule detection.** Each rule is detected with a **source citation**
(sheet!cell or notes span) and a **confidence**, or an explicit
`NOT DETECTED — requires human input` — it never guesses:

| Rule | How it's found |
|------|----------------|
| `age_basis` | "age next/last birthday" text (ANB/ALB) |
| `gst_treatment` | a `/1.09` (etc.) factor in a formula, or inclusive/exclusive text |
| `group_size_discount` | headcount + discount/loading phrasing (tiers **not** auto-parsed) |
| `rider_dependencies` | "X must be taken with Y / requires Y / rider to Y" |
| `renewal_only_bands` | "renewal only / not new business" beside an age band |
| `occupation_class_rules` | Class 1–4 references + any eligibility/loading note |

**STEP 3 — Compiled JSON.** `insurer`, `source_file`, `detection_log`, `rules`,
`tier_mapping` (empty by design — configured per brokerage), and `rate_table`.
Every `rate_table` row copies its `premium` verbatim from `cell_values` and
records a `source_cell` for traceability. `member_type` is captured when a
section is labelled for Employee/Dependant. Both are documented extensions to the
spec's 7-field row (added because Step 4 requires values to trace to cells).

**STEP 4 — Module generation.** Gated on `approved: true`. Produces a
dependency-free `{insurer_slug}.py`:
- `RATE_TABLE` — the approved rows as a module-level list of dicts.
- `RULES` — the approved rules dict.
- `calculate_premium(age, coverage, plan, class_=None, group_size=1, is_renewal=False, dob=None, effective_date=None) -> float`
  — age-band lookup (tightest band wins) + rule application:
  - age from `dob`/`effective_date` honouring `age_basis`,
  - renewal-only bands raise for new business,
  - group-size discount applied only if `tiers` are configured,
  - GST conversion applied only if a numeric `conversion_factor` was confirmed.
- A top docstring listing each rule as auto-detected vs `human-confirmed`.

## Design guarantees

- **No fabricated rates.** Every premium traces to a real cell; a gap in the
  bands raises `ValueError` rather than interpolating.
- **Rules are opt-in.** Ambiguous/undetected rules are logged, not applied.
  Discounts and GST factors only take effect once confirmed numerically.
- **Human-in-the-loop.** Module generation is impossible until a reviewer sets
  `approved: true`.

## Limitations (deliberate)

- VBA/macro presence is detected (`xl/vbaProject.bin`); module *names* need
  `oletools` to enumerate and are not guessed.
- `group_size_discount` tier factors and complex multi-dimensional layouts may
  need manual entry into `compiled.json` before approval.
- The table extractor targets the common "age-band rows × plan columns, one
  product section per block" layout. Unrecognised layouts are logged under
  `extraction_warnings` rather than mis-parsed.

## To confirm a rule by hand

In `compiled.json`, edit the `rules` value and add `"human_confirmed": true` to
the matching `detection_log` entry — the generated docstring will then mark it
`human-confirmed` instead of `auto`.
