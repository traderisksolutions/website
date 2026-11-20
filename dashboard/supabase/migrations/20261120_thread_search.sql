-- Email search index (20 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Additive; safe to re-run.
-- NOT applied on 20 Nov 2026. Until it is, search falls back to the old route (docs/search.md).
--
-- One row per email thread: what a person types to find it. Subject, everyone on it (names and
-- addresses of every participant and sender), its file names, and the text of its latest
-- messages (body_text only, never body_html; capped at the first 4,000 characters). Kept by src/lib/search/thread-search-server.ts:
-- ingest refreshes one thread's row after each stored message; scripts/backfill-thread-search.ts
-- fills the rest in batches of 100, by hand.
--
-- names  subject, people and file names together, for partial words ("jiaq") by trigram
-- doc    to_tsvector('simple', subject || people || attachments || body), for whole and prefix words

create extension if not exists pg_trgm;

create table if not exists public.thread_search (
  thread_id        uuid primary key references public.email_threads(id) on delete cascade,
  company_id       uuid,
  mailboxes        text[] not null default '{}',
  subject          text not null default '',
  people           text not null default '',
  attachments      text not null default '',
  body             text not null default '',
  last_message_at  timestamptz,
  updated_at       timestamptz not null default now(),
  names            text generated always as (subject || ' ' || people || ' ' || attachments) stored,
  doc              tsvector generated always as (to_tsvector('simple', subject || ' ' || people || ' ' || attachments || ' ' || body)) stored
);

create index if not exists thread_search_doc_gin    on public.thread_search using gin (doc);
create index if not exists thread_search_names_trgm on public.thread_search using gin (names gin_trgm_ops);
create index if not exists thread_search_last       on public.thread_search (last_message_at desc nulls last);
create index if not exists thread_search_company    on public.thread_search (company_id);

notify pgrst, 'reload schema';
