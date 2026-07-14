-- Group Benefits (Phase 1): versioned insurer rate-matrix extraction + storage.
-- Upload a PDF -> 3 extractors (Opus + Gemini + code parser) -> Opus judge -> human
-- review -> approved version. Rates are normalized (must be exact); benefits are EAV
-- (flexible per insurer). Run in the Supabase SQL editor.

-- One row per uploaded PDF version (per insurer + product + year).
create table if not exists gb_rate_tables (
  id             uuid primary key default gen_random_uuid(),
  insurer_id     uuid references insurers(id) on delete set null,
  insurer_name   text,                              -- denormalised for display / when unlinked
  product_code   text not null,                     -- GHS | GOC | GOS | (raw)
  product_name   text,
  plan_year      int,
  effective_date date,
  age_basis      text default 'next_birthday' check (age_basis in ('next_birthday','last_birthday')),
  source_pdf_url text,
  source_pdf_name text,
  status         text not null default 'draft' check (status in ('draft','extracting','in_review','approved','archived')),
  version        int  not null default 1,
  notes          text,
  uploaded_by    uuid,
  approved_by    uuid,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists gb_rate_tables_insurer_idx on gb_rate_tables (insurer_id, product_code, status);

-- Plan definitions (the tier differentiators: hospital type, beds, co-pay). A single PDF
-- can hold several products (GHS/GOC/GOS), so product_code lives on the child rows too.
create table if not exists gb_plans (
  id            uuid primary key default gen_random_uuid(),
  rate_table_id uuid not null references gb_rate_tables(id) on delete cascade,
  product_code  text not null default '',
  plan_code     text not null,
  plan_name     text,
  hospital_type text,                               -- PTE | GRH | ...
  beds          text,
  co_payment    text,
  renewal_only  boolean not null default false,
  is_new        boolean not null default false,
  sort_order    int,
  notes         text,
  unique (rate_table_id, product_code, plan_code)
);

-- The rate matrix cells — an age (band) maps to a premium per plan. Must be exact.
create table if not exists gb_rates (
  id            uuid primary key default gen_random_uuid(),
  rate_table_id uuid not null references gb_rate_tables(id) on delete cascade,
  product_code  text not null default '',
  plan_code     text not null,
  band_label    text,                               -- "Up to 25", "26-30", "71-75*"
  age_min       int,
  age_max       int,
  premium       numeric(12,2) not null,
  renewal_only  boolean not null default false,
  unique (rate_table_id, product_code, plan_code, band_label)
);
create index if not exists gb_rates_lookup_idx on gb_rates (rate_table_id, product_code, plan_code, age_min, age_max);

-- Benefit schedule — flexible EAV so any insurer's line items fit. Captures "everything".
create table if not exists gb_benefits (
  id            uuid primary key default gen_random_uuid(),
  rate_table_id uuid not null references gb_rate_tables(id) on delete cascade,
  product_code  text not null default '',
  plan_code     text,                               -- null = applies to all plans
  category      text,                               -- section grouping in the schedule
  benefit_name  text not null,
  value_text    text,
  value_numeric numeric(14,2),
  unit          text,
  notes         text,
  sort_order    int
);
create index if not exists gb_benefits_table_idx on gb_benefits (rate_table_id, product_code, plan_code);

-- Audit of every extractor pass (opus / gemini / parser / judge) for accuracy tracing.
create table if not exists gb_extraction_runs (
  id            uuid primary key default gen_random_uuid(),
  rate_table_id uuid not null references gb_rate_tables(id) on delete cascade,
  extractor     text not null check (extractor in ('opus','gemini','parser','judge')),
  model         text,
  raw_json      jsonb,
  conflicts     jsonb,                              -- judge only: list of disagreements
  confidence    numeric(5,2),
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(12,6),
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists gb_extraction_runs_table_idx on gb_extraction_runs (rate_table_id, extractor);

-- Per-insurer extraction profile — the expected shape (products/plans/benefit lines/age
-- basis/footnote conventions) fed to the extractors to raise accuracy over time.
create table if not exists gb_extraction_profiles (
  id           uuid primary key default gen_random_uuid(),
  insurer_id   uuid references insurers(id) on delete cascade,
  insurer_name text,
  product_code text,
  profile      jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  unique (insurer_id, product_code)
);
