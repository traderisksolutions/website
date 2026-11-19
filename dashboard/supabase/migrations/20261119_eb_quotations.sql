-- Employment Benefits proposals (19 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- A quotation from /eb kept as it stood when a person pressed Save quotation or Prepare proposal:
-- the insurers ticked, each category's plans and premiums, the census, and the benefit rows of the
-- chosen plans. The proposal PDF and the client email are built from this row, so what the client
-- received can be read back later.
--
-- snapshot     jsonb, src/lib/gb/eb-proposal.ts Snapshot
-- proposal_ref the PDF as last rendered and kept (drivefile:<id>)
-- draft_id     the email draft on the client thread (ai_drafts)
-- sent_*       set once the email has gone

create table if not exists public.eb_quotations (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references public.companies(id) on delete set null,
  company_name   text not null,
  thread_id      uuid references public.email_threads(id) on delete set null,
  effective_date date,
  basis          text check (basis in ('renewal', 'new_business')),
  products       text[] not null default '{}',
  snapshot       jsonb not null,
  version        integer not null default 1,
  proposal_ref   text,
  proposal_name  text,
  draft_id       uuid,
  sent_at        timestamptz,
  sent_by        text,
  sent_to        text,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists eb_quotations_company on public.eb_quotations (company_id, created_at desc);

grant all on table public.eb_quotations to service_role;

notify pgrst, 'reload schema';
