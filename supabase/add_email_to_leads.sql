-- Add email enrichment columns to outbound_leads
ALTER TABLE outbound_leads ADD COLUMN IF NOT EXISTS email        text;
ALTER TABLE outbound_leads ADD COLUMN IF NOT EXISTS email_status text; -- 'valid' | 'not_found' | 'unknown'

CREATE INDEX IF NOT EXISTS outbound_leads_email_idx
  ON outbound_leads (email)
  WHERE email IS NOT NULL;
