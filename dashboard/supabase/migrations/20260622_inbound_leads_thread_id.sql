-- Add thread_id to inbound_leads so we can store the email thread created
-- when the first reply is sent from the Inbound Leads page.
-- This makes the Engagement Agent use the correct thread instead of
-- doing an ambiguous email-based lookup that can return forwarded newsletters.

ALTER TABLE inbound_leads
  ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES email_threads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_thread ON inbound_leads (thread_id);
