-- Pricing Matrix (rebuilt from scratch, 2026-07-22).
-- NEW MODEL: each insurer ships a COMPLETE working Excel calculator (rates embedded in
-- its own sheets; formulas do the math). We do NOT extract rates or re-derive pricing —
-- we RUN the insurer's real workbook formula graph (Python `formulas` engine) by writing a
-- census into its input cells and reading the premium/total cells back. Zero AI in the
-- numbers. The one thing we must capture per workbook is a CELL-MAP PROFILE (which cells are
-- inputs / plan-selections / outputs / totals) — AI proposes it, a human confirms it.
--
-- The brochure PDF is kept for policy wordings + the recommendation, NOT for pricing.
-- Files (xlsx + pdf) live in the existing private `group-benefits` storage bucket.
-- Run in the Supabase SQL editor. The old gb_* tables are left intact (deprecated, unused).

-- One row per uploaded calculator version (per insurer, versioned yearly).
create table if not exists pm_calculators (
  id                 uuid primary key default gen_random_uuid(),
  insurer_id         uuid references insurers(id) on delete set null,
  insurer_name       text,                         -- denormalised label, e.g. "Steadfast MCare+"
  label              text,                         -- optional human label for this version

  -- Storage (bare object paths in the `group-benefits` bucket).
  xlsx_path          text,                         -- the calculator workbook (required to be usable)
  xlsx_filename      text,
  brochure_path      text,                         -- optional brochure PDF (wordings/pricing reference)
  brochure_filename  text,

  effective_date     date,                         -- rate version / effective date
  version            int  not null default 1,
  status             text not null default 'draft'
                     check (status in ('draft','mapping','in_review','approved','archived')),

  -- The CELL-MAP PROFILE that drives the engine (see pm-profile.ts for the shape).
  profile            jsonb not null default '{}'::jsonb,
  -- A lightweight dump summary of the workbook (sheets, headers, dropdowns, sample formulas)
  -- shown in the review UI so a human can confirm the proposed mapping.
  workbook_summary   jsonb,
  -- Latest golden-verification result: drives sample lives through the engine and records the
  -- computed values a human eyeballed before approving.
  verification       jsonb,

  notes              text,
  uploaded_by        uuid,
  approved_by        uuid,
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists pm_calculators_insurer_idx on pm_calculators (insurer_id, status);
create index if not exists pm_calculators_status_idx   on pm_calculators (status, created_at desc);

-- Audit of every automated pass over a calculator (dump / AI map proposal / verify / run).
create table if not exists pm_calculator_runs (
  id             uuid primary key default gen_random_uuid(),
  calculator_id  uuid not null references pm_calculators(id) on delete cascade,
  kind           text not null check (kind in ('dump','map_propose','verify','run')),
  model          text,
  input          jsonb,
  output         jsonb,
  ok             boolean not null default true,
  error          text,
  duration_ms    int,
  input_tokens   int,
  output_tokens  int,
  cost_usd       numeric(12,6),
  created_at     timestamptz not null default now()
);
create index if not exists pm_calculator_runs_calc_idx on pm_calculator_runs (calculator_id, kind, created_at desc);

-- Touch updated_at on change.
create or replace function pm_touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists pm_calculators_touch on pm_calculators;
create trigger pm_calculators_touch before update on pm_calculators
  for each row execute function pm_touch_updated_at();
