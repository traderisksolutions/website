-- Group Benefits (Phase 2): census quotations + multi-insurer comparison.
-- A quotation runs one company census across selected approved rate tables and stores the
-- inputs + computed per-insurer totals for history. Run in the Supabase SQL editor.

create table if not exists gb_quotations (
  id             uuid primary key default gen_random_uuid(),
  company_name   text,
  effective_date date,
  gst_rate       numeric(5,4) not null default 0.09,   -- prevailing SG GST (rates are ex-GST)
  product_codes  jsonb not null default '[]'::jsonb,    -- ["GHS","GOS"]
  rate_table_ids jsonb not null default '[]'::jsonb,    -- approved tables compared
  category_map   jsonb not null default '{}'::jsonb,    -- { rate_table_id: { product: { category: plan_code } } }
  census         jsonb not null default '[]'::jsonb,    -- the input members
  results        jsonb not null default '{}'::jsonb,    -- per-insurer totals + breakdown
  member_count   int not null default 0,
  source         text default 'csv',                    -- csv | email
  notes          text,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists gb_quotations_created_idx on gb_quotations (created_at desc);

-- Flattened per member × insurer × product line (for detail views / export / RFQ feed later).
create table if not exists gb_quote_lines (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references gb_quotations(id) on delete cascade,
  rate_table_id uuid,
  insurer_name  text,
  member_index  int,
  member_name   text,
  relationship  text,                                   -- self | spouse | child
  category      text,
  age           int,
  product_code  text,
  plan_code     text,
  premium       numeric(12,2),
  note          text                                    -- e.g. "no band for age", "no plan mapped"
);
create index if not exists gb_quote_lines_q_idx on gb_quote_lines (quotation_id);
