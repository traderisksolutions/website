-- Phase 1 of the reply-threading fix.
--
-- Outgoing replies were sent with no In-Reply-To/References headers, so recipients
-- on Outlook (e.g. AIA) saw each reply as a disconnected message, and there was no
-- quoted history in the body. To build proper References chains we need each
-- message's RFC822 "Message-ID" header — but we only stored Gmail's internal id
-- (gmail_message_id), which can't be used as a References value.
--
-- Capture the real Message-ID (and the In-Reply-To it points at) at ingest so the
-- send path can thread replies correctly. Existing rows stay null until re-ingested
-- or backfilled; new replies start threading immediately.
--
-- Run in the Supabase SQL editor.

alter table email_messages
  add column if not exists rfc822_message_id text,
  add column if not exists in_reply_to        text;

-- References chains resolve a prior message by its Message-ID — index for lookup.
create index if not exists idx_messages_rfc822_message_id
  on email_messages using btree (rfc822_message_id);
