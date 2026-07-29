-- Pricing Matrix v2 (rebuilt 2026-07-29) — normalized rate tables instead of running the
-- insurer's raw workbook. The old model (RUN the real Excel formula graph via pm_run.py, cell-
-- map profile approved by a human) didn't scale across insurers whose workbooks don't expose a
-- clean per-life premium cell (multi-tab, category-level plan selection, aggregate-only totals).
--
-- NEW MODEL: extract each insurer's rates + rules + coverage wordings ONCE at upload time (from
-- BOTH the xlsx calculator and the brochure PDF, Opus + Gemini cross-checked), store them
-- structured here, and compute every quote ourselves from the stored data. A human reviews and
-- approves the extraction before it's usable in a live quote — same trust gate as before, just
-- gating stored rates/rules instead of a cell map. No AI calls and no Python at quote time.
--
-- pm_calculators.profile / workbook_summary / verification / pricing (from the old model) are
-- left in place, unused — same precedent as the old gb_* tables being left intact when THEY were
-- deprecated. Run in the Supabase SQL editor (after 20260722_pricing_matrix.sql and friends).

-- 'mapping' -> 'extracting' (rename to match the new pipeline); everything else unchanged.
alter table pm_calculators drop constraint if exists pm_calculators_status_check;
alter table pm_calculators add constraint pm_calculators_status_check
  check (status in ('draft','extracting','in_review','approved','archived'));

-- Old cell-map approvals carry no meaning under the new schema — nothing should read as
-- "approved" until it's been re-extracted and re-reviewed. Files are untouched, so this costs
-- no re-upload, only a re-run of the (now free, cached) extraction step.
update pm_calculators set status = 'draft' where status <> 'draft';

-- One row per calculator (1:1) — the normalized rate table + insurer-specific pricing rules.
create table if not exists pm_rate_tables (
  id             uuid primary key default gen_random_uuid(),
  calculator_id  uuid not null unique references pm_calculators(id) on delete cascade,

  age_basis      text check (age_basis in ('ANB','ALB')),  -- Age Next/Last Birthday

  -- [{code, full_name, member_type?, plans:[{code,label,attrs}], age_bands:[...],
  --   rates:[{band, by_plan:{planCode: number}}]}] — same shape the old transparency panel used.
  coverages      jsonb not null default '[]'::jsonb,

  -- Insurer-specific, freeform-but-typed-where-common:
  --   { group_size_loading: [{min,max,loading_pct}], loading_excludes: ["TL","CI","PA"],
  --     quote_basis_exclusions: {new_business:["71-75"], renewal:[...]},
  --     gst: {inclusive: bool, rate: number} }
  rules          jsonb not null default '{}'::jsonb,

  -- Opus-vs-Gemini cross-check summary: {extractors, total_rates, agreed, conflicts, adjudicated, single_source}
  accuracy       jsonb,

  reviewed_by    uuid,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One row per calculator — freeform coverage/wordings terms, keyed by plan within `terms`.
create table if not exists pm_benefit_terms (
  id             uuid primary key default gen_random_uuid(),
  calculator_id  uuid not null unique references pm_calculators(id) on delete cascade,

  -- [{plan_code?, category, label, value, notes?, source: 'xlsx'|'pdf'}]
  terms          jsonb not null default '[]'::jsonb,
  accuracy       jsonb,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists pm_rate_tables_touch on pm_rate_tables;
create trigger pm_rate_tables_touch before update on pm_rate_tables
  for each row execute function pm_touch_updated_at();
drop trigger if exists pm_benefit_terms_touch on pm_benefit_terms;
create trigger pm_benefit_terms_touch before update on pm_benefit_terms
  for each row execute function pm_touch_updated_at();

-- Add the new extraction kinds. The app never writes 'map_propose'/'verify'/'run' going forward,
-- but existing pm_calculator_runs rows carry them as history — widen the constraint rather than
-- rewrite audit history to fit it.
alter table pm_calculator_runs drop constraint if exists pm_calculator_runs_kind_check;
alter table pm_calculator_runs add constraint pm_calculator_runs_kind_check
  check (kind in ('dump','map_propose','verify','run','rate_extract','benefit_extract','spot_check'));
