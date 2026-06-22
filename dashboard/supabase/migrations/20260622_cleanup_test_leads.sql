-- Block 1: Reset both test leads to 'new' so they leave the Engagement Agent.
-- They will still appear in Inbound Leads so you can resend from there.
-- When you resend, the new thread_id will be stamped correctly.
UPDATE inbound_leads
SET    status     = 'new',
       thread_id  = NULL
WHERE  email IN ('jjjhong9797@gmail.com', 'jarodhong5533@gmail.com');

-- Block 2: Clear campaign_context on any threads from these test emails
-- so the C-badged entry in New Prospects moves to Existing Clients as FWD/CC.
UPDATE email_threads et
SET    campaign_context = NULL
WHERE  et.campaign_context IS NOT NULL
  AND (
    -- threads linked via contact record
    et.contact_id IN (
      SELECT id FROM contacts
      WHERE  email IN ('jjjhong9797@gmail.com', 'jarodhong5533@gmail.com')
    )
    OR
    -- threads only reachable via participants (jjjhong9797 has no contact)
    EXISTS (
      SELECT 1 FROM email_participants ep
      WHERE  ep.thread_id = et.id
        AND  ep.email IN ('jjjhong9797@gmail.com', 'jarodhong5533@gmail.com')
    )
  );

-- Block 3: Verify
SELECT id, email, status, contact_id, thread_id
FROM   inbound_leads
WHERE  email IN ('jjjhong9797@gmail.com', 'jarodhong5533@gmail.com');
