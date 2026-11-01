-- Assistant RM foundation (2 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- company_ledger  every event for a company, in date order, with links: the knowledge base each
--                 agent reads. The Knowledge depositor is its only writer.
-- agent_cursors   where each agent stopped reading a company's ledger, so it resumes there.
-- ai_drafts.pair_id / party   two drafts that go together (insurer chase + client update): one Send.
-- work_items.later_*          "Come back later": a time, or until the client or insurer replies.
-- companies.kind  adds tpa and vendor beside partner (other brokers), so they never open client cases.

create table if not exists public.company_ledger (
  id            uuid primary key default gen_random_uuid(),
  seq           bigserial unique,
  group_id      uuid references public.companies(id) on delete cascade,
  company_id    uuid references public.companies(id) on delete cascade,
  occurred_at   timestamptz not null,
  kind          text not null,       -- email_in, email_out, email_rebuilt, document, policy, debit_note, claim, case, fact, note
  title         text not null,
  summary       text,                -- the message's own text, trimmed; no model summary
  party         text,                -- client, insurer, internal, partner, tpa, vendor, other
  actor         text,                -- sender address, staff email or agent name
  policy_id     uuid references public.policies(id) on delete set null,
  work_item_id  uuid references public.work_items(id) on delete set null,
  thread_id     uuid references public.email_threads(id) on delete set null,
  links         jsonb not null default '[]'::jsonb,  -- [{label, url}] email thread, Drive file, policy folder
  source_table  text not null,
  source_id     text not null,
  created_at    timestamptz not null default now()
);
create unique index if not exists company_ledger_source on public.company_ledger(source_table, source_id, company_id);
create index if not exists company_ledger_company_idx on public.company_ledger(company_id, occurred_at desc);
create index if not exists company_ledger_group_idx on public.company_ledger(group_id, occurred_at desc);
create index if not exists company_ledger_seq_idx on public.company_ledger(group_id, seq);

create table if not exists public.agent_cursors (
  agent       text not null,
  group_id    uuid not null references public.companies(id) on delete cascade,
  last_seq    bigint not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (agent, group_id)
);

alter table public.ai_drafts add column if not exists pair_id uuid;
alter table public.ai_drafts add column if not exists party   text;
create index if not exists ai_drafts_pair_idx on public.ai_drafts(pair_id) where pair_id is not null;

alter table public.work_items add column if not exists later_until timestamptz;
alter table public.work_items add column if not exists later_when  text;   -- client_reply, insurer_reply
alter table public.work_items add column if not exists later_by    text;

alter table public.companies drop constraint if exists companies_kind_check;
alter table public.companies add constraint companies_kind_check check (kind in ('client', 'insurer', 'partner', 'tpa', 'vendor', 'other'));

grant all on table public.company_ledger, public.agent_cursors to service_role;
grant usage, select on sequence public.company_ledger_seq_seq to service_role;
notify pgrst, 'reload schema';
