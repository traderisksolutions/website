-- A Drive copy of each email attachment, kept the first time anyone opens it (21 Nov 2026, Jarod:
-- "save on API connections"). Additive; safe to re-run. Apply with the runner on Jarod's go. Named
-- to sort after 20261121_x_agent_documents.sql.
--
-- email_attachments.storage_url stays as it is: 11,556 rows carry an old bucket path that other
-- records still match on. drive_file_id is the copy in the Shared Drive (email-attachments/<YYYY-MM>/);
-- once set, the file is read from Drive and Gmail is not asked again.

alter table public.email_attachments add column if not exists drive_file_id text;
