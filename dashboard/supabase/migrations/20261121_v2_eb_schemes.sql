-- Employment Benefits scheme file (21 Nov 2026, docs/eb-v2.md P2). Additive; safe to re-run. Apply
-- with the runner (npm run db:migrate -- --apply) on Jarod's go. Named to sort after
-- 20261121_tree_filing.sql.
--
-- One row per client per plan year: the census and last year's policy as read on /eb, with who
-- read them and when, so a quotation for that year opens filled in and the next year's census is
-- compared with this one. Written by /eb on each read (PUT /api/eb/scheme); no model.
--
--   census          { file, members[] } as read (gb-quote Member)
--   last_year       the LastYear read (src/lib/gb/last-year.ts) and its files

create table if not exists public.eb_schemes (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  plan_year          text not null,
  effective_date     date,
  basis              text check (basis in ('renewal', 'new_business')),
  insurer            text,
  census             jsonb,
  census_read_at     timestamptz,
  census_read_by     text,
  last_year          jsonb,
  last_year_files    jsonb not null default '[]',
  last_year_read_at  timestamptz,
  last_year_read_by  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (company_id, plan_year)
);

create index if not exists eb_schemes_company_idx on public.eb_schemes (company_id, plan_year desc);

grant all on table public.eb_schemes to service_role;
