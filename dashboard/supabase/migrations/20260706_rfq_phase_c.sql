-- RFQ Pipeline — Phase C (routing + reply loop).
-- The Gmail thread id is captured at send time so that when the sent RFQ (and later
-- the insurer's reply) is ingested, we can correlate the email_threads row back to
-- its dispatch, link it to the case as an insurer thread, and flag replies.
-- Run this in the Supabase SQL editor.

alter table rfq_dispatches
  add column if not exists gmail_thread_id text;   -- Gmail thread id from /api/email/send

create index if not exists rfq_dispatches_gmail_thread_idx
  on rfq_dispatches(gmail_thread_id)
  where gmail_thread_id is not null;
