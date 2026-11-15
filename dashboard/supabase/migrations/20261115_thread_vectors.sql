-- Thread vectors (15 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- thread_vectors      one vector per thread, made on a CPU by scripts/embed-threads.mts from the thread's
--                     subject and its first messages' own text. No model API is called and nothing is paid.
-- thread_similarity   how close each candidate thread is to the centre of a set of reference threads
--                     (the threads already on a case). Orders proposals; decides nothing.

create extension if not exists vector;

create table if not exists public.thread_vectors (
  thread_id   uuid primary key references public.email_threads(id) on delete cascade,
  model       text not null,
  text_hash   text not null,                 -- sha256 of model + text: unchanged text is never embedded twice
  embedding   vector(384) not null,
  embedded_at timestamptz not null default now()
);

create or replace function public.thread_similarity(p_reference uuid[], p_candidates uuid[])
returns table (thread_id uuid, similarity real)
language sql stable as $$
  with centre as (
    select avg(v.embedding) as c from public.thread_vectors v where v.thread_id = any(p_reference)
  )
  select v.thread_id, (1 - (v.embedding <=> centre.c))::real
  from public.thread_vectors v, centre
  where centre.c is not null and v.thread_id = any(p_candidates)
$$;

grant all on table public.thread_vectors to service_role;
grant execute on function public.thread_similarity(uuid[], uuid[]) to service_role;

notify pgrst, 'reload schema';
