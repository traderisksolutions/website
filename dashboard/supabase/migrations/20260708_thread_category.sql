-- Inbox triage classification (Workstream 5). Badge-only signal, no automation.
-- On inbound ingest a cheap classifier tags each thread; the UI shows a badge.
-- Run in the Supabase SQL editor.

alter table email_threads
  add column if not exists category            text,
  add column if not exists category_confidence numeric,
  add column if not exists categorized_at      timestamptz;

-- rfq | claim | renewal | general | other
create index if not exists email_threads_category_idx on email_threads(category);
