-- Pricing Matrix — structured, human-reviewed calculation logic per calculator.
--
-- pm_rate_tables.coverages[].rates is a flat age-band lookup — correct for insurers whose Excel
-- is genuinely just a populated rate grid, but several insurers' calculators are closer to a
-- blank formula shell: loading %, tiered/conditional plan selection, GST handling, etc. live as
-- Excel FORMULAS, not values. pm_computation_rules stores that logic, once per calculator,
-- extracted by AI from the workbook's formulas and reviewed/approved by a human — same trust
-- gate as pm_rate_tables, but its own independent lifecycle: a rate refresh (new numbers, same
-- insurer rules) shouldn't force re-reviewing calculation logic that didn't change.
--
-- `rules` is an ordered array of a BOUNDED set of step primitives (age_band_lookup, flat_rate,
-- percentage_loading, conditional_tier_selection, combine, gst_adjustment — see pm-rules-extract.ts)
-- rather than a general expression language, so every step stays auditable against a source_ref
-- (an Excel cell ref or PDF anchor) instead of being an opaque formula string.
--
-- Backward compatible by construction: computeInsurerQuote() (pm-calc.ts) only takes the rules
-- branch when an APPROVED row exists here with a non-empty `rules` array; every calculator
-- approved before this migration has no row, so it keeps running through today's flat
-- age-band lookup untouched. No re-extraction is required for existing calculators.
--
-- Run in the Supabase SQL editor (after 20260812_pm_taxonomy.sql).

create table if not exists pm_computation_rules (
  id             uuid primary key default gen_random_uuid(),
  calculator_id  uuid not null unique references pm_calculators(id) on delete cascade,
  version        int not null default 1,

  -- Per-insurer Excel shape, detected before rate extraction (see pm-rules-extract.ts):
  --   'embedded_table' = xlsx has its own populated rate tables too (cross-checked vs the PDF)
  --   'formula_shell'  = xlsx is blank input cells + formulas only, no populated numbers
  --   'hybrid'         = both
  source         text not null check (source in ('embedded_table','formula_shell','hybrid')),

  -- Independent from pm_calculators.status / pm_rate_tables — logic can be approved on its own.
  status         text not null default 'draft' check (status in ('draft','in_review','approved','archived')),

  rules          jsonb not null default '[]'::jsonb,   -- ordered RuleStep[]
  variables      jsonb not null default '{}'::jsonb,   -- named inputs the steps read (group_size, selected_plan, ...)
  accuracy       jsonb,                                 -- Opus-vs-Gemini structural cross-check summary

  reviewed_by    uuid,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists pm_computation_rules_touch on pm_computation_rules;
create trigger pm_computation_rules_touch before update on pm_computation_rules
  for each row execute function pm_touch_updated_at();

-- Provenance of pm_rate_tables' numbers, now that the PDF brochure is the primary numeric
-- source (previously the xlsx was assumed to hold the complete rate matrix). Nullable — existing
-- rows predate this distinction and don't need a backfill to keep working.
alter table pm_rate_tables add column if not exists source text check (source in ('pdf','xlsx','hybrid'));

-- New reconciliation kinds: 'computation_rule' (Opus-vs-Gemini rule-step sequences differ
-- materially — one issue per calculator, not per-step, since diffing arbitrary rule graphs
-- cell-by-cell is exactly the complexity the bounded rule vocabulary is meant to avoid) and
-- 'xlsx_pdf_rate_mismatch' (the xlsx's own embedded rate cell disagrees with the PDF's stated
-- rate for the same cell — a source-vs-source conflict, distinct from a model-vs-model one).
alter table pm_reconciliation_issues drop constraint if exists pm_reconciliation_issues_kind_check;
alter table pm_reconciliation_issues add constraint pm_reconciliation_issues_kind_check
  check (kind in ('rule','term','computation_rule','xlsx_pdf_rate_mismatch'));

alter table pm_calculator_runs drop constraint if exists pm_calculator_runs_kind_check;
alter table pm_calculator_runs add constraint pm_calculator_runs_kind_check
  check (kind in ('dump','map_propose','verify','run','rate_extract','benefit_extract','spot_check','rules_extract','shape_detect'));
