-- Email follow-ups (4 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- One row per email TRS sent that waits on a reply: its type (for reporting), who it went to, and
-- when to chase. A person sets the chase when approving the email on Today; an email sent from
-- Gmail gets the default for its type. The hourly sweep marks replies and drafts the chases
-- (src/lib/followups). preapproved = the person who sent the email also approved its chases, which
-- then go out through the auto-sender's safeguards (hours, caps, kill switch).
create table if not exists public.email_followups (
  id             uuid primary key default gen_random_uuid(),
  message_id     uuid not null unique references public.email_messages(id) on delete cascade,
  thread_id      uuid references public.email_threads(id) on delete cascade,
  work_item_id   uuid references public.work_items(id) on delete set null,
  draft_id       uuid,
  sent_at        timestamptz not null,
  sent_by        text,
  to_party       text not null default 'other' check (to_party in ('insurer', 'client', 'other')),
  to_email       text,
  cc             text,
  subject        text,
  email_type     text not null default 'other',
  expects_reply  boolean not null default true,
  first_after_days int not null default 5,
  every_days     int not null default 5,
  working_days   boolean not null default true,
  max_chases     int not null default 3,
  chases         int not null default 0,
  next_chase_at  timestamptz,
  set_by         text not null default 'rule',
  preapproved    boolean not null default false,
  status         text not null default 'waiting' check (status in ('waiting', 'replied', 'superseded', 'chased_out', 'off', 'not_needed')),
  replied_at     timestamptz,
  last_draft_id  uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists email_followups_due_idx on public.email_followups (status, next_chase_at);
create index if not exists email_followups_thread_idx on public.email_followups (thread_id);
alter table public.email_followups enable row level security;
grant select, insert, update, delete on public.email_followups to service_role;
revoke all on public.email_followups from anon;
notify pgrst, 'reload schema';
