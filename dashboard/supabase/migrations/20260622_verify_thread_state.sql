-- Check current state of both test leads and all threads linked to their contacts
SELECT
  il.id          AS lead_id,
  il.email,
  il.status,
  il.contact_id,
  il.thread_id   AS lead_thread_id,
  et.id          AS thread_id,
  et.subject     AS thread_subject,
  et.created_at  AS thread_created,
  et.gmail_thread_id
FROM inbound_leads il
LEFT JOIN contacts c    ON c.id = il.contact_id
LEFT JOIN email_threads et ON et.contact_id = c.id AND et.deleted_at IS NULL
WHERE il.email IN ('jarodhong5533@gmail.com', 'jjjhong9797@gmail.com')
ORDER BY il.email, et.created_at;
