-- Pricing Matrix — Phase 2: census quotations across insurer calculators.
-- A quote = one census run through N approved calculators (each RUN via its own Excel formula
-- graph, pm_run.py) → a side-by-side comparison. Numbers come from the workbooks, never AI.
-- Run in the Supabase SQL editor (after 20260722_pricing_matrix.sql).

create table if not exists pm_quotations (
  id              uuid primary key default gen_random_uuid(),
  company_name    text,
  effective_date  date,

  -- Inputs.
  census          jsonb not null default '[]'::jsonb,   -- [{name, date_of_birth|age, relationship, category}]
  calculator_ids  uuid[] not null default '{}',          -- selected approved calculators
  -- Per-insurer plan selections applied to the census:
  --   { "<calculator_id>": { "<coverage_code>": { "<field>": "<value>" } } }
  selections      jsonb not null default '{}'::jsonb,

  -- Computed comparison (see pm-quote.ts QuoteResult): per-insurer totals + per-member breakdown.
  results         jsonb,
  member_count    int not null default 0,

  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists pm_quotations_created_idx on pm_quotations (created_at desc);
