-- Insurer claims experience (3 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- The insurer's own statement of a policy period: premium, claims paid and reserved, loss ratio, as
-- sent with renewal invitations or on request. It outranks TRS's claims register when the renewal
-- price check reads a period (src/lib/policies/ledger/index.ts), because the register is incomplete.
-- claims.source marks rows backfilled from mail, so a backfill can be found and removed in one filter.
create table if not exists public.claims_experience (
  id             uuid primary key default gen_random_uuid(),
  policy_id      uuid references public.policies(id) on delete cascade,
  company_id     uuid references public.companies(id) on delete set null,
  insurer_name   text,
  policy_number  text,
  period_from    date,
  period_to      date,
  premium        numeric,
  claims_paid    numeric,
  claims_reserve numeric,
  claims_count   int,
  loss_ratio     numeric,
  as_of          date,
  thread_id      uuid,
  evidence       text,
  source         text not null default 'mail',
  created_at     timestamptz not null default now()
);
create index if not exists claims_experience_policy_idx on public.claims_experience (policy_id, as_of desc);
alter table public.claims_experience enable row level security;
grant select, insert, update, delete on public.claims_experience to service_role;
revoke all on public.claims_experience from anon;
alter table public.claims add column if not exists source text;
alter table public.claims add column if not exists amount_reserved numeric;
notify pgrst, 'reload schema';
