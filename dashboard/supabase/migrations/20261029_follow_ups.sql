-- Nexus follow-ups (29 Oct 2026): one ledger of who owes what across client, broker and insurer.
--   follow_ups: one row per open question, request, promised date, quotation, renewal or unpaid
--   debit note. Rows from email are opened and settled by the reader; rows from RFQ dispatches,
--   renewals and debit notes are opened and closed by the hourly sync as their source changes.
--   dedupe_key makes every source idempotent.
--   follow_up_reads: one row per email message the reader has claimed, so the ingest hook and the
--   hourly cron never read (and pay for) the same message twice.
--   A read that fails keeps its error and is retried by the cron, up to 3 attempts.
-- Additive. Safe to re-run.

create table if not exists follow_ups (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid references companies(id) on delete set null,
  thread_id             uuid references email_threads(id) on delete set null,
  message_id            uuid references email_messages(id) on delete set null,
  owner_party           text not null check (owner_party in ('trs','insurer','client','date')),
  owner_email           text,
  counterparty_name     text,
  counterparty_email    text,
  what                  text not null,
  due_at                timestamptz,
  since_at              timestamptz not null default now(),
  status                text not null default 'open' check (status in ('open','done','snoozed','dismissed')),
  snoozed_until         timestamptz,
  closed_at             timestamptz,
  closed_by             text,
  closed_by_message_id  uuid references email_messages(id) on delete set null,
  source_kind           text not null check (source_kind in ('email','rfq','renewal','debit_note','claim')),
  source_ref            text,
  source_label          text,
  chase_draft_id        uuid,
  chased_at             timestamptz,
  chase_count           integer not null default 0,
  dedupe_key            text not null unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists follow_ups_open_idx    on follow_ups(status, due_at);
create index if not exists follow_ups_thread_idx  on follow_ups(thread_id) where status in ('open','snoozed');
create index if not exists follow_ups_company_idx on follow_ups(company_id);
create index if not exists follow_ups_owner_idx   on follow_ups(owner_email);
create index if not exists follow_ups_source_idx  on follow_ups(source_kind, status);

create table if not exists follow_up_reads (
  message_id  uuid primary key references email_messages(id) on delete cascade,
  read_at     timestamptz not null default now(),
  opened      integer not null default 0,
  closed      integer not null default 0,
  attempts    integer not null default 1,
  error       text
);

create or replace function follow_ups_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists follow_ups_touch on follow_ups;
create trigger follow_ups_touch before update on follow_ups for each row execute function follow_ups_touch();

grant select, insert, update, delete on follow_ups to service_role;
grant select, insert, update, delete on follow_up_reads to service_role;
revoke all on follow_ups from anon;
revoke all on follow_up_reads from anon;
notify pgrst, 'reload schema';
