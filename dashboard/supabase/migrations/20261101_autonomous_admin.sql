-- Autonomous admin foundation (1 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- agent_tasks    the only way one agent hands work to another. No agent calls another directly.
-- company_facts  the knowledge bank: one fact per row, each with its source and date, per group.
-- claims         the claims register, every class: one row per claim, tied to its work item.
-- rebuilt_messages  messages TRS never received but read inside a forward or quoted history.
-- work_item_threads.joined_by  how a thread was tied to its case, shown on the case.

create table if not exists public.agent_tasks (
  id               uuid primary key default gen_random_uuid(),
  agent            text not null,
  kind             text not null,
  company_id       uuid references public.companies(id) on delete set null,
  policy_id        uuid references public.policies(id) on delete set null,
  work_item_id     uuid references public.work_items(id) on delete set null,
  thread_id        uuid references public.email_threads(id) on delete set null,
  message_id       uuid,
  payload          jsonb not null default '{}'::jsonb,
  result           jsonb,
  status           text not null default 'queued',
  attempts         int not null default 0,
  max_attempts     int not null default 3,
  run_after        timestamptz not null default now(),
  locked_at        timestamptz,
  error            text,
  idem_key         text not null,
  created_by_agent text not null default 'system',
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);
alter table public.agent_tasks drop constraint if exists agent_tasks_status_check;
alter table public.agent_tasks add constraint agent_tasks_status_check check (status in ('queued', 'running', 'done', 'failed', 'needs_human', 'skipped'));
create unique index if not exists agent_tasks_idem_key on public.agent_tasks(idem_key);
create index if not exists agent_tasks_ready_idx on public.agent_tasks(run_after) where status = 'queued';
create index if not exists agent_tasks_human_idx on public.agent_tasks(created_at desc) where status = 'needs_human';
create index if not exists agent_tasks_thread_idx on public.agent_tasks(thread_id);

-- Takes up to n ready tasks for the given agents (all agents when null) and marks them running.
-- A task left running for 15 minutes is treated as crashed and taken again.
create or replace function public.claim_agent_tasks(p_agents text[], p_limit int)
returns setof public.agent_tasks language sql as $$
  update public.agent_tasks t set status = 'running', locked_at = now(), attempts = t.attempts + 1
   where t.id in (
     select id from public.agent_tasks
      where ((status = 'queued' and run_after <= now()) or (status = 'running' and locked_at < now() - interval '15 minutes'))
        and (p_agents is null or agent = any(p_agents))
      order by run_after
      limit greatest(1, least(p_limit, 50))
      for update skip locked)
  returning t.*;
$$;
revoke execute on function public.claim_agent_tasks(text[], int) from public;
grant execute on function public.claim_agent_tasks(text[], int) to service_role;

create table if not exists public.company_facts (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid references public.companies(id) on delete cascade,  -- top of the group; the company itself when standalone
  company_id       uuid references public.companies(id) on delete cascade,
  policy_id        uuid references public.policies(id) on delete set null,
  topic            text not null,      -- cover, insured, contact, claims_handling, billing, members, requirement, preference, history
  key              text not null,      -- e.g. 'wica.insurer', 'claims.contact', 'fleet.vehicles'
  value            text not null,
  source_kind      text not null,      -- email, attachment, policy, document, staff
  source_id        text,
  source_date      date,
  quote            text,               -- the words the fact was read from, under 240 characters
  confidence       text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  superseded_by    uuid references public.company_facts(id) on delete set null,
  created_by_agent text not null,
  created_at       timestamptz not null default now()
);
create index if not exists company_facts_group_idx on public.company_facts(group_id, topic) where superseded_by is null;
create index if not exists company_facts_company_idx on public.company_facts(company_id) where superseded_by is null;
create unique index if not exists company_facts_once on public.company_facts(company_id, key, value, coalesce(source_id, ''));

create table if not exists public.claims (
  id               uuid primary key default gen_random_uuid(),
  work_item_id     uuid unique references public.work_items(id) on delete set null,
  company_id       uuid references public.companies(id) on delete set null,
  policy_id        uuid references public.policies(id) on delete set null,
  insurer_name     text,
  class            text,               -- wica, ghs, gpa, motor, property, liability, marine, travel, other
  policy_number    text,
  insurer_ref      text,
  claimant         text,
  loss_date        date,
  loss_summary     text,
  notified_at      date,
  amount_claimed   numeric(14,2),
  amount_settled   numeric(14,2),
  currency         text not null default 'SGD',
  stage            text not null default 'notified',
  waiting_on       text,               -- client, insurer, trs, adjuster, third_party
  opened_mode      text not null default 'normal',
  gaps             jsonb not null default '[]'::jsonb,   -- [{item, basis}] documents or facts still missing
  documents        jsonb not null default '[]'::jsonb,   -- [{name, received_at, source}]
  last_mail_at     timestamptz,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.claims drop constraint if exists claims_stage_check;
alter table public.claims add constraint claims_stage_check check (stage in ('notified', 'documents_pending', 'with_insurer', 'adjuster', 'offer', 'settled', 'declined', 'withdrawn'));
alter table public.claims drop constraint if exists claims_opened_mode_check;
alter table public.claims add constraint claims_opened_mode_check check (opened_mode in ('normal', 'from_forward', 'midway', 'manual'));
create index if not exists claims_open_idx on public.claims(stage, last_mail_at desc) where closed_at is null;
create index if not exists claims_company_idx on public.claims(company_id);
create index if not exists claims_insurer_ref_idx on public.claims(lower(insurer_ref)) where insurer_ref is not null;
create index if not exists claims_policy_no_idx on public.claims(lower(policy_number)) where policy_number is not null;

create table if not exists public.rebuilt_messages (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid not null references public.email_threads(id) on delete cascade,
  source_message_id uuid not null references public.email_messages(id) on delete cascade,
  origin            text not null check (origin in ('forward', 'quoted')),
  position          int not null,       -- 0 = oldest rebuilt message in the source
  from_address      text,
  from_name         text,
  to_addresses      text[] not null default '{}',
  cc_addresses      text[] not null default '{}',
  sent_at           timestamptz,
  sent_at_text      text,               -- the date line as written, kept when it cannot be parsed
  subject           text,
  body_text         text,
  attachments_named text[] not null default '{}',  -- files the text names; TRS may not hold them
  trs_copied        boolean not null default false, -- was any TRS address on it
  hash              text not null,
  created_at        timestamptz not null default now()
);
create unique index if not exists rebuilt_messages_hash on public.rebuilt_messages(hash);
create index if not exists rebuilt_messages_thread_idx on public.rebuilt_messages(thread_id, sent_at);

alter table public.work_item_threads add column if not exists joined_by       text;
alter table public.work_item_threads add column if not exists joined_evidence text;

grant all on table public.agent_tasks, public.company_facts, public.claims, public.rebuilt_messages to service_role;

notify pgrst, 'reload schema';
