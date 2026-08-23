-- Formalizes columns that were previously only added ad-hoc via the manual runbook at
-- supabase-migration-inbound-auto-draft.sql (never checked into supabase/migrations/, so the
-- live schema and the tracked migration history had drifted). All IF NOT EXISTS — safe to run
-- even where these columns already exist on the live database.
--
-- Adds `priority` and `product_line` on top of the original ai_draft_id/ai_draft_at pair: the
-- inbound auto-draft route now piggybacks a priority rating onto its existing Gemini call, and
-- maps the lead's topic chip onto the canonical product-line taxonomy (src/lib/product-lines.ts).

ALTER TABLE ai_drafts
  ADD COLUMN IF NOT EXISTS inbound_lead_id uuid REFERENCES inbound_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS knowledge_docs  jsonb;

ALTER TABLE inbound_leads
  ADD COLUMN IF NOT EXISTS ai_draft_id   uuid,
  ADD COLUMN IF NOT EXISTS ai_draft_at   timestamptz,
  ADD COLUMN IF NOT EXISTS priority      text CHECK (priority IN ('high','medium','low')),
  ADD COLUMN IF NOT EXISTS product_line  text;

CREATE INDEX IF NOT EXISTS idx_inbound_leads_no_draft
  ON inbound_leads (id)
  WHERE ai_draft_id IS NULL;

-- Fast lookup for the hourly catch-up cron (api/cron/inbound-draft-catchup) that scans for
-- rows the instant pg_net trigger missed.
CREATE INDEX IF NOT EXISTS idx_inbound_leads_draft_catchup
  ON inbound_leads (created_at)
  WHERE ai_draft_id IS NULL AND source != 'whatsapp_click' AND email IS NOT NULL;
