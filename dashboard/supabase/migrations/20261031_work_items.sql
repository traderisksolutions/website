-- Work items (31 Oct 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- One row per piece of open work for a client: a claim, a renewal, a quotation, a member
-- movement, a premium matter. The case worker reads the case's threads whole and keeps the row
-- current: where it stands, who it waits on, the next step, the deadline, and a ready draft in
-- ai_drafts. People approve, edit, reassign or close. Nothing here sends.
--
-- The client-side and insurer-side threads of one matter belong to one item (work_item_threads),
-- which is what lets a claim filed under QBE show on the client's page.

create table if not exists public.work_items (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid references public.companies(id) on delete set null,
  client_name      text,
  case_type        text not null default 'other',
  title            text not null,
  status           text not null default 'trs_to_act',
  waiting_since    date,
  last_activity_at timestamptz,
  summary          text,
  next_action      text,
  deadline         date,
  deadline_basis   text,
  insurer_name     text,
  policy_id        uuid references public.policies(id) on delete set null,
  policy_number    text,
  owner_email      text,
  suggested_owner  text,
  owner_basis      text,
  needs_human      text,
  confidence       text,
  draft_id         uuid references public.ai_drafts(id) on delete set null,
  evidence         jsonb not null default '[]'::jsonb,
  source           text not null default 'case_worker',
  model            text,
  read_at          timestamptz,
  snoozed_until    date,
  closed_at        timestamptz,
  closed_by        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.work_items drop constraint if exists work_items_case_type_check;
alter table public.work_items add constraint work_items_case_type_check check (case_type in
  ('claim', 'renewal', 'new_quote', 'endorsement', 'member_movement', 'premium_billing', 'documents', 'enquiry', 'other'));
alter table public.work_items drop constraint if exists work_items_status_check;
alter table public.work_items add constraint work_items_status_check check (status in
  ('trs_to_act', 'waiting_client', 'waiting_insurer', 'stalled', 'done'));
alter table public.work_items drop constraint if exists work_items_confidence_check;
alter table public.work_items add constraint work_items_confidence_check check (confidence is null or confidence in ('high', 'medium', 'low'));
create index if not exists work_items_open_idx    on public.work_items(status, deadline) where closed_at is null;
create index if not exists work_items_owner_idx   on public.work_items(owner_email) where closed_at is null;
create index if not exists work_items_company_idx on public.work_items(company_id);

create table if not exists public.work_item_threads (
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  thread_id    uuid not null references public.email_threads(id) on delete cascade,
  side         text not null default 'client' check (side in ('client', 'insurer', 'internal', 'other')),
  created_at   timestamptz not null default now(),
  primary key (work_item_id, thread_id)
);
-- A thread belongs to at most one open item; the case worker moves it when cases merge.
create unique index if not exists work_item_threads_thread_key on public.work_item_threads(thread_id);

-- Every change a person or the agent makes, so an item's history reads back.
create table if not exists public.work_item_events (
  id           uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  kind         text not null,           -- read, status, owner, draft, sent, closed, reopened, snoozed, note
  actor        text not null,           -- staff email or 'case_worker'
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists work_item_events_item_idx on public.work_item_events(work_item_id, created_at desc);

-- Staff who have left: their open items surface as unowned until reassigned.
create table if not exists public.staff_departures (
  email      text primary key,
  left_on    date not null,
  handed_to  text,
  noted_by   text,
  created_at timestamptz not null default now()
);

grant all on table public.work_items, public.work_item_threads, public.work_item_events, public.staff_departures to service_role;

alter table public.ai_drafts add column if not exists work_item_id uuid references public.work_items(id) on delete set null;

insert into public.staff_departures (email, left_on, noted_by)
values ('catherine.lim@trade-risksol.com', '2026-10-30', 'migration')
on conflict (email) do nothing;

notify pgrst, 'reload schema';
