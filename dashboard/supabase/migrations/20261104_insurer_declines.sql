-- Insurer declines (4 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- Every time an insurer declined a risk, and why: read from the mail (Jun–Nov 2026) and written by
-- the placement agent from then on. The insurer page shows it; the quote-request panel skips an
-- insurer that declined a similar risk on the line in the last year (src/lib/placement/workflow.ts).
create table if not exists public.insurer_declines (
  id                 uuid primary key default gen_random_uuid(),
  insurer_company_id uuid references public.companies(id) on delete set null,
  insurer_name       text not null,
  kind               text not null default 'appetite' check (kind in ('appetite', 'blocked', 'onboarding', 'other')),
  line               text,
  risk               text,
  reason             text,
  quote              text,
  client_company_id  uuid references public.companies(id) on delete set null,
  client_name        text,
  declined_on        date,
  thread_id          uuid references public.email_threads(id) on delete set null,
  dispatch_id        uuid,
  source             text not null default 'mail',
  created_at         timestamptz not null default now()
);
create unique index if not exists insurer_declines_dispatch_key on public.insurer_declines (dispatch_id) where dispatch_id is not null;
create index if not exists insurer_declines_insurer_idx on public.insurer_declines (insurer_company_id, declined_on desc);
alter table public.insurer_declines enable row level security;
grant select, insert, update, delete on public.insurer_declines to service_role;
revoke all on public.insurer_declines from anon;
notify pgrst, 'reload schema';
