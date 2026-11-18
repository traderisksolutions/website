-- Today's learning loop (19 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- today_threads.signals   what was true of the thread when it was added (on_list, known_client,
--                          from:client|insurer, cat:<category>): the positives
-- today_dismissals         a suggestion a person dismissed, with the same signals: the negatives.
--                          A newer message on the thread makes it eligible again.

alter table public.today_threads add column if not exists signals text[] not null default '{}';

create table if not exists public.today_dismissals (
  id           uuid primary key default gen_random_uuid(),
  owner_email  text not null,
  thread_id    uuid not null references public.email_threads(id) on delete cascade,
  signals      text[] not null default '{}',
  dismissed_at timestamptz not null default now(),
  unique (owner_email, thread_id)
);

grant all on table public.today_dismissals to service_role;

notify pgrst, 'reload schema';
