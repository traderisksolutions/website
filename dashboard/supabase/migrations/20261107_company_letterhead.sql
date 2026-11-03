-- Client letterhead on the appointment letter (4 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- The client's logo (a small PNG or JPEG as a data URL) and the address lines printed in the
-- letterhead band at the top of letters the client signs. Saved from the letter dialog, so the
-- next letter for the same client starts with them.
alter table public.companies add column if not exists letterhead_logo text;
alter table public.companies add column if not exists letterhead_address text;
