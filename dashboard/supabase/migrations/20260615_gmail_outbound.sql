-- Gmail-based outbound campaign sending.
-- Adds per-lead scheduling, step tracking, and Gmail thread linking to ob_campaign_leads.

ALTER TABLE public.ob_campaign_leads
  ADD COLUMN IF NOT EXISTS current_step      integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS step1_sent_at     timestamptz,
  ADD COLUMN IF NOT EXISTS step2_sent_at     timestamptz,
  ADD COLUMN IF NOT EXISTS step3_sent_at     timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_thread_id   text,
  ADD COLUMN IF NOT EXISTS send_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS from_email        text;

-- Fast lookup for the hourly send cron
CREATE INDEX IF NOT EXISTS ob_campaign_leads_send_queue_idx
  ON public.ob_campaign_leads(send_scheduled_at)
  WHERE send_status = 'queued';

-- Reply detection: match inbound threadId to an outbound campaign send
CREATE INDEX IF NOT EXISTS ob_campaign_leads_gmail_thread_idx
  ON public.ob_campaign_leads(gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;
