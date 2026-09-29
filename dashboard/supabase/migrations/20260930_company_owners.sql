-- A company can have one or many owners. `owner_emails` is the list; `owner_email` stays as
-- the first of that list so every existing read (inbox filing, triage, briefs, the Unassigned
-- views) keeps working unchanged. The app writes both together.
-- Run in the Supabase SQL editor.

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS owner_emails text[] NOT NULL DEFAULT '{}';
UPDATE public.companies SET owner_emails = ARRAY[owner_email] WHERE owner_email IS NOT NULL AND owner_emails = '{}';
CREATE INDEX IF NOT EXISTS companies_owner_emails_idx ON public.companies USING gin (owner_emails);
COMMENT ON COLUMN public.companies.owner_emails IS 'Account owners (staff emails), one or many. owner_email mirrors the first.';
