-- STEP 1: Diagnose — see what threads exist for each test contact
-- Run this first to verify the enquiry threads exist before patching.

SELECT
  il.id          AS lead_id,
  il.email       AS lead_email,
  il.topic,
  il.contact_id,
  il.thread_id   AS current_thread_id,
  et.id          AS candidate_thread_id,
  et.subject     AS thread_subject,
  et.created_at  AS thread_created
FROM inbound_leads il
LEFT JOIN contacts c    ON c.id = il.contact_id
LEFT JOIN email_threads et ON et.contact_id = c.id AND et.deleted_at IS NULL
WHERE il.email IN ('jarodhong5533@gmail.com', 'jjjhong9797@gmail.com')
ORDER BY il.email, et.created_at;

-- ────────────────────────────────────────────────────────────────
-- STEP 2: Fix — set thread_id to the oldest 'Enquiry:' thread
-- for each lead's linked contact. Run only after verifying Step 1
-- shows an 'Enquiry:' subject thread for each lead.

UPDATE inbound_leads il
SET thread_id = (
  SELECT et.id
  FROM   email_threads et
  JOIN   contacts c ON et.contact_id = c.id AND c.id = il.contact_id
  WHERE  et.deleted_at IS NULL
    AND  et.subject ILIKE 'Enquiry%'
  ORDER  BY et.created_at ASC
  LIMIT  1
)
WHERE il.email IN ('jarodhong5533@gmail.com', 'jjjhong9797@gmail.com')
  AND il.contact_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- STEP 3: Verify the patch applied
SELECT id, email, topic, contact_id, thread_id
FROM inbound_leads
WHERE email IN ('jarodhong5533@gmail.com', 'jjjhong9797@gmail.com');
