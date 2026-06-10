-- ─────────────────────────────────────────────────────────────
-- Campaign ↔ Engagement Bridge Migration
-- Run AFTER 20260611_outbound_revamp.sql
-- ─────────────────────────────────────────────────────────────

-- Store campaign context on a thread when a campaign lead replies.
-- Populated by email/ingest when the sender matches an outbound lead.
-- Structure: { campaign_id, campaign_name, product_type, step_replied_to, outbound_lead_id }
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS campaign_context JSONB;

-- Partial index: fast lookup of threads that came from campaigns
CREATE INDEX IF NOT EXISTS email_threads_campaign_context_idx
  ON public.email_threads((campaign_context IS NOT NULL))
  WHERE campaign_context IS NOT NULL;
