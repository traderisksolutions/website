-- Backfill thread_id on inbound_leads where contact_id is set and
-- the contact has a linked email_threads record (created by inbound/reply).
-- This fixes existing leads that were replied to before the thread_id
-- column existed, so the Engagement Agent shows the correct reply thread
-- instead of falling back to email-based lookup.

UPDATE inbound_leads il
SET    thread_id = et.id
FROM   contacts c
JOIN   email_threads et ON et.contact_id = c.id
WHERE  il.contact_id = c.id
  AND  il.thread_id IS NULL
  AND  et.deleted_at IS NULL
  -- Prefer the enquiry thread (subject starts with 'Enquiry:') over FWD threads
  AND  et.subject LIKE 'Enquiry:%'
;

-- For leads whose enquiry thread doesn't have 'Enquiry:' prefix (older records),
-- fall back to the oldest thread for the contact (most likely the first reply we sent).
UPDATE inbound_leads il
SET    thread_id = (
  SELECT et2.id
  FROM   email_threads et2
  WHERE  et2.contact_id = il.contact_id
    AND  et2.deleted_at IS NULL
  ORDER  BY et2.created_at ASC
  LIMIT  1
)
FROM   contacts c
WHERE  il.contact_id = c.id
  AND  il.thread_id IS NULL
;
