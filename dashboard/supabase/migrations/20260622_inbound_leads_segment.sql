ALTER TABLE inbound_leads
  ADD COLUMN IF NOT EXISTS segment      text,
  ADD COLUMN IF NOT EXISTS segment_note text;

COMMENT ON COLUMN inbound_leads.segment      IS 'Manual override: existing_client moves the lead out of New Prospects into Existing Clients';
COMMENT ON COLUMN inbound_leads.segment_note IS 'Reason recorded when a human transfers prospect → existing client';
