-- Automatic error log for background AI/API failures (Gemini rate limits, etc.) that previously
-- only surfaced as an ephemeral message in whichever page triggered them — nothing durable to
-- check afterwards, which is why a failure like the "Generate AI reply" 429 could only be reported
-- by screenshotting the toast. Mirrors audit_logs' shape/conventions but for system-side failures
-- rather than user actions — written directly by server code (see src/lib/error-log.ts), not
-- posted by the client, so there's no user session tied to a row.

create table if not exists error_logs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  source        text not null,             -- 'gemini' | 'anthropic' | 'roadplus' | 'supabase' | ...
  feature       text,                      -- e.g. 'draft_reply_drafter' — matches gemini-usage.ts features where applicable
  status_code   int,                       -- HTTP/API status, e.g. 429, 502
  message       text not null,             -- full error text, never truncated
  thread_id     text,
  resource_type text,
  resource_id   text,
  metadata      jsonb
);
create index if not exists error_logs_created_at_idx on error_logs (created_at desc);
create index if not exists error_logs_source_idx     on error_logs (source);
