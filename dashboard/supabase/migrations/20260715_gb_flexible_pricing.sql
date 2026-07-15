-- Pricing Matrix: flexible "one row per price point" model.
-- Each price point is a row: product_title + member_type (employee/dependant) + plan + age
-- band + price, with a jsonb escape hatch for any other dimension. Dated versioning: each
-- upload carries effective_date; newest date wins at quote time. Plus a new gb_coverage
-- table for sum-assured / coverage matrices. Run in the Supabase SQL editor.

-- 1. gb_rates becomes the flexible long pricing table. product_code holds the EXACT printed
--    product title (e.g. "GHS+EMM", "GTL+GACI").
alter table gb_rates
  add column if not exists member_type    text,                       -- 'employee' | 'dependant' | null
  add column if not exists dimensions      jsonb not null default '{}'::jsonb,
  add column if not exists insurer_id      uuid,
  add column if not exists insurer_name    text,
  add column if not exists effective_date  date;

-- Drop the rigid uniqueness (product,plan,band) so employee/dependant + extra-dimension rows
-- can coexist — the extractor/save de-dupe in code. Name-agnostic (only one unique on gb_rates).
do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'gb_rates'::regclass and contype = 'u' limit 1;
  if c is not null then execute 'alter table gb_rates drop constraint ' || quote_ident(c); end if;
end $$;

create index if not exists gb_rates_lookup2_idx
  on gb_rates (insurer_id, product_code, member_type, plan_code, effective_date);

-- 2. Coverage / sum-assured matrices (kept separate from the descriptive gb_benefits schedule).
create table if not exists gb_coverage (
  id            uuid primary key default gen_random_uuid(),
  rate_table_id uuid not null references gb_rate_tables(id) on delete cascade,
  product_title text,
  member_type   text,
  plan_code     text,
  item_label    text not null,                                        -- e.g. "37 Critical Illnesses"
  value_numeric numeric(16,2),
  value_text    text,
  unit          text,
  dimensions    jsonb not null default '{}'::jsonb,
  sort_order    int
);
create index if not exists gb_coverage_table_idx on gb_coverage (rate_table_id, product_title, member_type);
