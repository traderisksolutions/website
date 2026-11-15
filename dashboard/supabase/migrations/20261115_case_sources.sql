-- Case sources and case memory (15 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- email_threads.label*        one label per thread from a fixed list: a rule sets it, a person may change it.
-- work_item_thread_excluded   threads a person took off a case: never offered again, never read for it.
-- work_item_notes             the case's memory: one statement per row, who recorded it, the email it came from.
-- work_item_reads             which messages each agent has read for a case, so its next turn starts after them.
--
-- A person's pick is a work_item_threads row with joined_by = 'person' (the column exists since 1 Nov 2026).

alter table public.email_threads add column if not exists label       text;
alter table public.email_threads add column if not exists label_rule  text;         -- the label the rule gave, kept when a person changes it
alter table public.email_threads add column if not exists label_basis text;         -- what the rule matched on
alter table public.email_threads add column if not exists label_by    text;         -- 'rule' or the person's address
alter table public.email_threads add column if not exists label_at    timestamptz;
alter table public.email_threads drop constraint if exists email_threads_label_check;
alter table public.email_threads add constraint email_threads_label_check check (label is null or label in
  ('quotation_request', 'quote_received', 'renewal', 'claim', 'member_movement', 'endorsement', 'document', 'payment', 'other'));
create index if not exists email_threads_label_idx on public.email_threads(label) where deleted_at is null;

create table if not exists public.work_item_thread_excluded (
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  thread_id    uuid not null references public.email_threads(id) on delete cascade,
  excluded_by  text not null,
  created_at   timestamptz not null default now(),
  primary key (work_item_id, thread_id)
);
create index if not exists work_item_thread_excluded_thread_idx on public.work_item_thread_excluded(thread_id);

create table if not exists public.work_item_notes (
  id            uuid primary key default gen_random_uuid(),
  work_item_id  uuid not null references public.work_items(id) on delete cascade,
  section       text not null,
  text          text not null,
  quote         text,                -- the words the note was read from, found in the source email by code
  message_id    uuid references public.email_messages(id) on delete set null,
  thread_id     uuid references public.email_threads(id) on delete set null,
  source_date   date,
  author        text not null,       -- agent name or the person's address
  author_kind   text not null check (author_kind in ('agent', 'person')),
  status        text not null default 'current' check (status in ('current', 'superseded', 'rejected')),
  superseded_by uuid references public.work_item_notes(id) on delete set null,
  rejected_by   text,
  rejected_at   timestamptz,
  idem_key      text not null,
  created_at    timestamptz not null default now()
);
alter table public.work_item_notes drop constraint if exists work_item_notes_section_check;
alter table public.work_item_notes add constraint work_item_notes_section_check check (section in
  ('client_said', 'insurer_said', 'wish', 'risk', 'success_factor', 'open_question', 'next_step', 'decision', 'handover'));
create unique index if not exists work_item_notes_once on public.work_item_notes(idem_key);
create index if not exists work_item_notes_item_idx on public.work_item_notes(work_item_id, section) where status = 'current';

create table if not exists public.work_item_reads (
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  agent        text not null,
  message_id   uuid not null references public.email_messages(id) on delete cascade,
  read_at      timestamptz not null default now(),
  primary key (work_item_id, agent, message_id)
);

grant all on table public.work_item_thread_excluded, public.work_item_notes, public.work_item_reads to service_role;

notify pgrst, 'reload schema';
