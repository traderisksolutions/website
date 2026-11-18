-- Today (19 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- The threads a person put on their Today, by hand. One row per person per thread; Remove sets
-- removed_at and adding again clears it, so every add and remove stays on file for the learning loop.
--
-- side        client | insurer: whom the thread is with, chosen by the person
-- company_id  the client the thread is about (for an insurer thread, the insured client)

create table if not exists public.today_threads (
  id          uuid primary key default gen_random_uuid(),
  owner_email text not null,
  thread_id   uuid not null references public.email_threads(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete set null,
  side        text not null check (side in ('client', 'insurer')),
  added_at    timestamptz not null default now(),
  removed_at  timestamptz,
  unique (owner_email, thread_id)
);

create index if not exists today_threads_owner_open on public.today_threads (owner_email) where removed_at is null;

grant all on table public.today_threads to service_role;

notify pgrst, 'reload schema';
