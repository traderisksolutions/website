-- Store the email HTML body + extracted highlights (#2). Clients sometimes reply
-- by highlighting text inside the quoted message; that formatting was lost when we
-- stripped HTML to plain text. New emails now keep the HTML and the highlighted
-- spans so they surface in the thread and feed Opus. (Existing rows stay null
-- until re-ingested.) Run in the Supabase SQL editor.

alter table email_messages
  add column if not exists body_html  text,
  add column if not exists highlights text[];
