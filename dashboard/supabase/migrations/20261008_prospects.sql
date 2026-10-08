-- Prospect database + campaign review queue (8 Oct 2026).
--
-- prospect_accounts: one row per company, unique per market + domain.
-- prospect_contacts: named people at those companies. Generic inboxes (info@, sales@ …) are
--   refused at import, not stored. A contact becomes an outbound_leads row only when it is
--   enrolled in a campaign; outbound_lead_id links the two.
--
-- ob_campaigns gains:
--   metadata          the column the Gmail sender already reads (signature_id). It did not
--                     exist, so /api/cron/outbound-send failed its campaign read and sent nothing.
--   audience          who the daily top-up draws from: {"markets":["SG","HK"],"emailStatuses":["verified","published"]}
--   daily_new         people added to the review queue per day by the top-up (0 = off)
--   auto_approve      top-up rows go straight to the send queue instead of review
--   bounce_paused_at  set when the sender pauses the campaign for bounces
--
-- Review uses the existing ob_campaign_leads.approval_status = 'pending'. Approving sets
-- 'included' and queues the row for the sender. No new status values.
--
-- Apply: ~/trs-dn-migration/apply-sql.sh supabase/migrations/20261008_prospects.sql
-- Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS public.prospect_accounts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  market      text        NOT NULL CHECK (market IN ('SG','HK','ID','MY','OTHER')),
  name        text        NOT NULL,
  domain      text,
  website     text,
  industry    text,
  size        text,
  city        text,
  source      text        NOT NULL DEFAULT 'import',
  source_url  text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prospect_accounts_market_domain_key
  ON public.prospect_accounts (market, lower(domain)) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS prospect_accounts_created_idx ON public.prospect_accounts (created_at DESC);

CREATE TABLE IF NOT EXISTS public.prospect_contacts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid        NOT NULL REFERENCES public.prospect_accounts(id) ON DELETE CASCADE,
  full_name         text        NOT NULL,
  first_name        text,
  title             text,
  email             text,
  email_status      text        NOT NULL DEFAULT 'unknown'
                    CHECK (email_status IN ('verified','published','guessed','unknown','invalid')),
  email_source_url  text,
  phone             text,
  linkedin_url      text,
  source            text        NOT NULL DEFAULT 'import',
  do_not_contact    boolean     NOT NULL DEFAULT false,
  outbound_lead_id  uuid        REFERENCES public.outbound_leads(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prospect_contacts_email_key
  ON public.prospect_contacts (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS prospect_contacts_account_idx ON public.prospect_contacts (account_id);
CREATE INDEX IF NOT EXISTS prospect_contacts_created_idx ON public.prospect_contacts (created_at DESC);

ALTER TABLE public.ob_campaigns
  ADD COLUMN IF NOT EXISTS metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS audience         jsonb,
  ADD COLUMN IF NOT EXISTS daily_new        integer     NOT NULL DEFAULT 0 CHECK (daily_new BETWEEN 0 AND 200),
  ADD COLUMN IF NOT EXISTS auto_approve     boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bounce_paused_at timestamptz;

-- Enrolled prospects become outbound_leads with source 'prospect_db'. The original check allows
-- only the three Apollo/LinkedIn sources. NOT VALID: existing rows are not re-checked.
ALTER TABLE public.outbound_leads DROP CONSTRAINT IF EXISTS outbound_leads_source_check;
ALTER TABLE public.outbound_leads ADD CONSTRAINT outbound_leads_source_check
  CHECK (source IN ('url_lookup','people_search','company_search','prospect_db')) NOT VALID;

-- PostgREST reads its schema cache once; reload so the new tables and columns are visible.
NOTIFY pgrst, 'reload schema';
