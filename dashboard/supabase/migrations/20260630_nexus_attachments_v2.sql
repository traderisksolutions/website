-- Nexus Attachments v2 — add persistent storage URL + idempotency constraint
-- Run this after 20260630_nexus_cases.sql

alter table email_attachments
  add column if not exists storage_url text;

-- Unique constraint so extraction is idempotent (safe to re-run / retry)
alter table email_attachments
  drop constraint if exists email_attachments_msg_file_key;

alter table email_attachments
  add constraint email_attachments_msg_file_key unique (message_id, filename);
