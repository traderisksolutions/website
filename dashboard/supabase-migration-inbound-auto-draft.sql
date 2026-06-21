-- ── Inbound Auto-Draft Migration ──────────────────────────────────────────────
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Add columns to ai_drafts
--    inbound_lead_id: links the draft back to the lead row
--    knowledge_docs:  stores which FAQ doc names were used to generate the draft
ALTER TABLE ai_drafts
  ADD COLUMN IF NOT EXISTS inbound_lead_id uuid REFERENCES inbound_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS knowledge_docs  jsonb;

-- 2. Add columns to inbound_leads
--    ai_draft_id:  points to the ai_drafts row (null until auto-draft runs)
--    ai_draft_at:  timestamp of when the draft was generated
ALTER TABLE inbound_leads
  ADD COLUMN IF NOT EXISTS ai_draft_id  uuid,
  ADD COLUMN IF NOT EXISTS ai_draft_at  timestamptz;

-- 3. Optional: index for quick lookup of unprocessed leads (used by the Supabase webhook)
CREATE INDEX IF NOT EXISTS idx_inbound_leads_no_draft
  ON inbound_leads (id)
  WHERE ai_draft_id IS NULL;

-- ── Supabase pg_net Webhook (optional — for near-real-time triggering) ─────────
-- If you want drafts generated instantly on lead arrival (rather than waiting for
-- the user to open the lead), enable pg_net and run the trigger below.
-- The webhook calls /api/inbound/auto-draft when a new email lead is inserted.
--
-- BEFORE running: replace the two placeholder values below.

-- Step A: enable pg_net
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step B: create the trigger function
-- CREATE OR REPLACE FUNCTION trigger_inbound_auto_draft()
-- RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
-- BEGIN
--   IF NEW.source IS DISTINCT FROM 'whatsapp_click'
--      AND NEW.email IS NOT NULL
--      AND NEW.email != '' THEN
--     PERFORM net.http_post(
--       url     := 'YOUR_DASHBOARD_URL/api/inbound/auto-draft',
--       headers := jsonb_build_object(
--         'Content-Type',      'application/json',
--         'x-internal-secret', 'YOUR_CRON_SECRET'
--       ),
--       body    := jsonb_build_object('leadId', NEW.id)::text
--     );
--   END IF;
--   RETURN NEW;
-- END;
-- $$;

-- Step C: attach trigger
-- DROP TRIGGER IF EXISTS on_inbound_lead_created ON inbound_leads;
-- CREATE TRIGGER on_inbound_lead_created
--   AFTER INSERT ON inbound_leads
--   FOR EACH ROW EXECUTE FUNCTION trigger_inbound_auto_draft();
