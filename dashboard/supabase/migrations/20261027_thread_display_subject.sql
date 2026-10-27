-- A short title for a thread, written by the housekeeping agent from the subject and the first
-- message (27 Oct 2026). Display reads this first and falls back to the cleaned subject.
alter table email_threads add column if not exists display_subject text;
notify pgrst, 'reload schema';
