-- Reply Review currently only lets staff confirm/override the AI's classification label — there's
-- no way to actually respond to a reply from inside the dashboard. This adds an AI-drafted reply
-- body per ob_reply_events row, reviewed and edited by a human, then sent (never auto-sent).
alter table public.ob_reply_events
  add column if not exists draft_body         text,
  add column if not exists draft_generated_at  timestamptz,
  add column if not exists draft_status        text not null default 'none'
                            check (draft_status in ('none', 'drafted', 'sent')),
  add column if not exists sent_at             timestamptz,
  add column if not exists sent_by             uuid references auth.users(id) on delete set null,
  add column if not exists sent_from_email     text,
  add column if not exists sent_gmail_message_id text;
