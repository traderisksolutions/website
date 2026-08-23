-- ── Inbound Auto-Draft — Instant Trigger Setup ──────────────────────────────────
-- Run this manually in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- This file is NOT applied automatically and is NOT part of supabase/migrations/ — it embeds
-- your CRON_SECRET value, which must never be committed to git. Fill in the two placeholders
-- below with your real values before running, then do not commit your filled-in version.
--
-- The column additions this file used to contain (ai_drafts.inbound_lead_id/knowledge_docs,
-- inbound_leads.ai_draft_id/ai_draft_at/priority/product_line) are now tracked properly in
-- supabase/migrations/20260817_inbound_auto_draft_columns.sql — apply that first if you
-- haven't already (safe to re-run even if these columns already exist on your database).
--
-- What this does: gives drafts near-instant generation on lead arrival instead of waiting for
-- a human to open the lead or for the hourly catch-up cron (api/cron/inbound-draft-catchup) to
-- notice it. The catch-up cron stays on as a safety net in case this trigger ever fails on a
-- specific row (e.g. the app is redeploying at the exact moment the row lands).

-- Step A: enable pg_net (Postgres extension for outbound HTTP calls from a trigger)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step B: create the trigger function
CREATE OR REPLACE FUNCTION trigger_inbound_auto_draft()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.source IS DISTINCT FROM 'whatsapp_click'
     AND NEW.email IS NOT NULL
     AND NEW.email != '' THEN
    PERFORM net.http_post(
      url     := 'YOUR_DASHBOARD_URL/api/inbound/auto-draft',       -- e.g. https://your-app.vercel.app
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET'                  -- must match the CRON_SECRET env var exactly
      ),
      body    := jsonb_build_object('leadId', NEW.id)::text
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Step C: attach trigger
DROP TRIGGER IF EXISTS on_inbound_lead_created ON inbound_leads;
CREATE TRIGGER on_inbound_lead_created
  AFTER INSERT ON inbound_leads
  FOR EACH ROW EXECUTE FUNCTION trigger_inbound_auto_draft();
