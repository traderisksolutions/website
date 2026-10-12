-- Sales: leads → contacts → campaigns (12 Oct 2026).
--
-- Replaces the Apollo/Instantly pipeline. Leads arrive from TRS's own lead-generation tool
-- through /api/sales/intake (JSON, key) or a CSV upload; every draft waits for a person to
-- approve it; campaigns send as sales@traderisksolutions.com.sg through the dashboard's Gmail
-- connection, within the Spam Control Act's limits. Every table here is prefixed sales_.

-- ── Accounts, people, drafts ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location              text NOT NULL DEFAULT 'SG' CHECK (location ~ '^[A-Z]{2}$'),   -- ISO-2 market
  legal_name            text,
  trading_name          text,
  domain                text,
  country               text,
  industry              text,
  company_size_estimate text,
  business_model        text,
  public_description    text,
  business_trigger      text,              -- why now: the event that makes them worth a call
  exclusion_flags       text[] NOT NULL DEFAULT '{}',
  fit_score             integer CHECK (fit_score IS NULL OR fit_score BETWEEN 0 AND 100),
  intent_score          integer CHECK (intent_score IS NULL OR intent_score BETWEEN 0 AND 100),
  total_score           integer GENERATED ALWAYS AS (coalesce(fit_score, 0) + coalesce(intent_score, 0)) STORED,
  score_reasons         jsonb,
  score_evidence        jsonb,
  score_uncertainty     jsonb,
  recommended_action    text CHECK (recommended_action IS NULL OR recommended_action IN ('draft', 'research', 'human_review', 'suppress', 'reject')),
  workflow_pain         text,
  conversation_angle    text,
  product_line          text,              -- the TRS cover this lead most likely needs
  confidence            numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source_urls           text[] NOT NULL DEFAULT '{}',
  discovery_date        date,
  last_researched_at    timestamptz,
  source                text,              -- which tool or import wrote it
  status                text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'researching', 'scored', 'queued', 'suppressed', 'rejected', 'closed')),
  company_id            uuid REFERENCES public.companies(id) ON DELETE SET NULL,   -- once they become a client
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_accounts_location_domain_idx ON public.sales_accounts (location, lower(domain));
CREATE INDEX IF NOT EXISTS sales_accounts_created_idx ON public.sales_accounts (created_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_contacts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES public.sales_accounts(id) ON DELETE CASCADE,
  company               text,
  full_name             text,
  first_name            text,
  role                  text,
  email                 text,
  email_status          text NOT NULL DEFAULT 'unknown' CHECK (email_status IN ('verified', 'found_publicly', 'suggested', 'unknown', 'invalid', 'bounced', 'suppressed')),
  email_source          text,
  email_source_url      text,
  email_discovery_date  date,
  email_confidence      numeric,
  email_last_checked_at timestamptz,
  linkedin_url          text,
  phone                 text,
  phone_status          text,
  suppressed            boolean NOT NULL DEFAULT false,
  suppression_reason    text,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_contacts_account_idx ON public.sales_contacts (account_id);
CREATE INDEX IF NOT EXISTS sales_contacts_email_idx ON public.sales_contacts (lower(email));

-- A draft message to one person. pending_approval never sends.
CREATE TABLE IF NOT EXISTS public.sales_outreach (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES public.sales_accounts(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES public.sales_contacts(id) ON DELETE SET NULL,
  company         text,
  email           text,
  channel         text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp', 'linkedin', 'other')),
  location        text,
  subject         text,
  body            text,
  version         integer NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'queued', 'sent', 'replied', 'suppressed', 'cancelled')),
  reply_class     text,
  source          text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  approved_at     timestamptz,
  sent_at         timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_outreach_account_idx ON public.sales_outreach (account_id, version DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_outreach_status_idx ON public.sales_outreach (status);

-- Audit: who did what to a draft or contact. Detail holds ids and statuses, never email bodies.
CREATE TABLE IF NOT EXISTS public.sales_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL CHECK (kind IN (
    'approved', 'rejected', 'edited', 'reopened', 'marked_replied',
    'email_lookup', 'email_found', 'email_verified', 'email_not_found', 'contact_added',
    'send_claimed', 'sent', 'send_failed', 'dry_run', 'unsubscribed', 'bounced', 'intake'
  )),
  actor       text NOT NULL,     -- an email for people, 'system:<job>' for crons
  account_id  uuid REFERENCES public.sales_accounts(id) ON DELETE CASCADE,
  contact_id  uuid REFERENCES public.sales_contacts(id) ON DELETE SET NULL,
  outreach_id uuid REFERENCES public.sales_outreach(id) ON DELETE SET NULL,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS sales_events_kind_day_idx ON public.sales_events (kind, created_at DESC);

-- ── One row per lead, for the Leads page ─────────────────────────────────────────────────
-- A view, not a synced table: always current, nothing to schedule.

CREATE OR REPLACE VIEW public.leads_unified AS
WITH contact_pick AS (
  SELECT DISTINCT ON (c.account_id) c.account_id, c.id AS contact_id, c.full_name, c.role, c.email, c.email_status,
         c.email_confidence, c.email_source_url, c.linkedin_url, c.phone
    FROM public.sales_contacts c
   WHERE NOT c.suppressed
   ORDER BY c.account_id,
            CASE c.email_status WHEN 'verified' THEN 0 WHEN 'found_publicly' THEN 1 WHEN 'suggested' THEN 2 WHEN 'unknown' THEN 3 ELSE 4 END,
            (c.email IS NULL), c.created_at
),
contact_counts AS (
  SELECT account_id, count(*) AS contact_count,
         count(*) FILTER (WHERE email_status = 'verified') AS verified_contact_count,
         jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'title', role, 'email', email, 'email_status', email_status,
                   'email_confidence', email_confidence, 'email_source_url', email_source_url, 'linkedin_url', linkedin_url,
                   'phone', phone, 'phone_status', phone_status) ORDER BY created_at) AS contacts
    FROM public.sales_contacts GROUP BY account_id
),
draft_pick AS (
  SELECT DISTINCT ON (o.account_id) o.account_id, o.id AS outreach_id, o.status AS outreach_status, o.channel AS outreach_channel,
         o.subject AS outreach_subject, o.body AS outreach_body, o.email AS outreach_to_email, o.version AS outreach_version,
         o.created_at AS drafted_at, o.approved_at, o.sent_at
    FROM public.sales_outreach o
   ORDER BY o.account_id, o.version DESC, o.created_at DESC
)
SELECT a.id, a.id AS source_id, a.source, a.location, a.country,
       coalesce(a.trading_name, a.legal_name) AS company, a.legal_name, a.domain, a.industry,
       a.company_size_estimate AS company_size, a.business_model, a.status AS account_status, a.recommended_action,
       a.fit_score, a.intent_score, a.total_score, a.confidence,
       a.business_trigger AS intent_summary, a.workflow_pain, a.conversation_angle, a.product_line,
       a.score_evidence AS evidence, a.score_reasons, a.score_uncertainty AS uncertainty, a.source_urls, a.exclusion_flags,
       coalesce(cc.contact_count, 0) AS contact_count, coalesce(cc.verified_contact_count, 0) AS verified_contact_count,
       cp.full_name AS contact_name, cp.role AS contact_title, cp.email AS contact_email, cp.email_status,
       (cp.email_status = 'verified') AS email_verified, cp.email_confidence, cp.email_source_url,
       cp.linkedin_url AS contact_linkedin_url, cp.phone AS contact_phone, cc.contacts,
       dp.outreach_id, dp.outreach_status, dp.outreach_channel, dp.outreach_subject, dp.outreach_body, dp.outreach_to_email,
       dp.outreach_version, dp.drafted_at, dp.approved_at, dp.sent_at,
       a.discovery_date, a.last_researched_at, a.company_id, a.created_at, a.updated_at
  FROM public.sales_accounts a
  LEFT JOIN contact_pick cp ON cp.account_id = a.id
  LEFT JOIN contact_counts cc ON cc.account_id = a.id
  LEFT JOIN draft_pick dp ON dp.account_id = a.id;

-- ── Audience: every email address TRS may write to, merged ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_audience (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text NOT NULL UNIQUE CHECK (email = lower(email)),
  name               text,
  first_name         text,
  company            text,
  title              text,
  linkedin_url       text,
  location           text,
  relationship       text NOT NULL DEFAULT 'other' CHECK (relationship IN ('client', 'enquiry', 'prospect', 'other')),
  sources            text[] NOT NULL DEFAULT '{}',
  email_status       text,
  sales_contact_id   uuid REFERENCES public.sales_contacts(id) ON DELETE SET NULL,
  sales_account_id   uuid REFERENCES public.sales_accounts(id) ON DELETE SET NULL,
  suppressed         boolean NOT NULL DEFAULT false,
  suppression_reason text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_audience_rel_idx ON public.sales_audience (relationship, location);

-- Permanent do-not-email list: unsubscribes and bounces.
CREATE TABLE IF NOT EXISTS public.sales_suppressions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE CHECK (email = lower(email)),
  reason     text NOT NULL CHECK (reason IN ('unsubscribed', 'bounced', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Rebuilds sales_audience from every source. Run from the app after an intake or import, and
-- by the campaign runner; the dashboard has no pg_cron.
CREATE OR REPLACE FUNCTION public.sync_sales_audience() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  WITH src AS (
    -- Prospects from the lead tool.
    SELECT lower(trim(c.email)) AS email, c.full_name AS name, c.first_name,
           coalesce(c.company, a.trading_name, a.legal_name) AS company, c.role AS title, c.linkedin_url,
           a.location, 'prospect'::text AS relationship, 3 AS rank, coalesce(a.source, 'lead_tool') AS source,
           c.email_status, c.id AS sales_contact_id, a.id AS sales_account_id, c.suppressed, c.suppression_reason
      FROM sales_contacts c JOIN sales_accounts a ON a.id = c.account_id
     WHERE c.email IS NOT NULL
    UNION ALL
    -- Clients: contacts of companies TRS insures. Enquiries: everyone else who wrote in.
    SELECT lower(trim(ct.email)), nullif(trim(concat_ws(' ', ct.first_name, ct.last_name)), ''), ct.first_name,
           coalesce(co.company_name, ct.company), ct.title, NULL, 'SG',
           CASE WHEN co.kind = 'client' THEN 'client' ELSE 'enquiry' END,
           CASE WHEN co.kind = 'client' THEN 1 ELSE 2 END,
           CASE WHEN co.kind = 'client' THEN 'client' ELSE coalesce(ct.source, 'contact') END,
           'verified', NULL, NULL, false, NULL
      FROM contacts ct LEFT JOIN companies co ON co.id = ct.company_id
     WHERE ct.email IS NOT NULL AND coalesce(ct.is_employee, false) = false
       AND lower(ct.email) !~ '@(trade-risksol\.com|traderisksol\.com|kyn\.com\.sg)$'
  ),
  valid AS (SELECT * FROM src WHERE email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  best AS (SELECT DISTINCT ON (email) * FROM valid ORDER BY email, rank, sales_contact_id NULLS LAST),
  srcs AS (SELECT email, array_agg(DISTINCT source ORDER BY source) AS sources, bool_or(suppressed) AS any_suppressed FROM valid GROUP BY email)
  INSERT INTO sales_audience AS t (email, name, first_name, company, title, linkedin_url, location, relationship, sources,
                                   email_status, sales_contact_id, sales_account_id, suppressed, suppression_reason)
  SELECT b.email, b.name, coalesce(b.first_name, split_part(b.name, ' ', 1)), b.company, b.title, b.linkedin_url, b.location,
         b.relationship, s.sources, b.email_status, b.sales_contact_id, b.sales_account_id,
         s.any_suppressed OR EXISTS (SELECT 1 FROM sales_suppressions o WHERE o.email = b.email),
         coalesce(b.suppression_reason, (SELECT o.reason FROM sales_suppressions o WHERE o.email = b.email LIMIT 1))
    FROM best b JOIN srcs s USING (email)
  ON CONFLICT (email) DO UPDATE SET
    name = coalesce(excluded.name, t.name),
    first_name = coalesce(excluded.first_name, t.first_name),
    company = coalesce(excluded.company, t.company),
    title = coalesce(excluded.title, t.title),
    linkedin_url = coalesce(excluded.linkedin_url, t.linkedin_url),
    location = coalesce(excluded.location, t.location),
    relationship = CASE WHEN array_position(ARRAY['client','enquiry','prospect','other'], excluded.relationship)
                           <= array_position(ARRAY['client','enquiry','prospect','other'], t.relationship)
                        THEN excluded.relationship ELSE t.relationship END,
    sources = (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(t.sources || excluded.sources) x),
    email_status = excluded.email_status,
    sales_contact_id = excluded.sales_contact_id,
    sales_account_id = excluded.sales_account_id,
    suppressed = t.suppressed OR excluded.suppressed,
    suppression_reason = coalesce(t.suppression_reason, excluded.suppression_reason),
    updated_at = now()
  WHERE (t.name, t.company, t.title, t.location, t.relationship, t.sources, t.email_status, t.sales_contact_id, t.suppressed)
        IS DISTINCT FROM
        (coalesce(excluded.name, t.name), coalesce(excluded.company, t.company), coalesce(excluded.title, t.title),
         coalesce(excluded.location, t.location), t.relationship, t.sources, excluded.email_status, excluded.sales_contact_id,
         t.suppressed OR excluded.suppressed);
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE sales_audience t SET suppressed = true, suppression_reason = coalesce(t.suppression_reason, o.reason), updated_at = now()
    FROM sales_suppressions o WHERE o.email = t.email AND NOT t.suppressed;
  RETURN n;
END $$;

-- ── Campaigns ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_campaigns (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  from_name      text NOT NULL,
  first_touch    text NOT NULL DEFAULT 'template' CHECK (first_touch IN ('template', 'personal_draft')),
  audience       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {relationships, locations, verifiedOnly, namedOnly, sources}
  demo_url       text,
  deck_url       text,
  booking_url    text,
  auto_enrol     boolean NOT NULL DEFAULT false,
  auto_approve   boolean NOT NULL DEFAULT false,
  daily_new      integer NOT NULL DEFAULT 10 CHECK (daily_new BETWEEN 0 AND 100),
  last_topup_on  date,
  paused_reason  text,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_campaign_steps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES public.sales_campaigns(id) ON DELETE CASCADE,
  step_number  integer NOT NULL CHECK (step_number BETWEEN 1 AND 10),
  subject      text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',
  delay_days   integer NOT NULL DEFAULT 0 CHECK (delay_days >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, step_number)
);

-- One person in one campaign. review → (approve) → active → completed; replied/bounced/unsubscribed stop it.
CREATE TABLE IF NOT EXISTS public.sales_campaign_contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid NOT NULL REFERENCES public.sales_campaigns(id) ON DELETE CASCADE,
  email               text NOT NULL,
  name                text,
  first_name          text,
  company             text,
  title               text,
  linkedin_url        text,
  location            text,
  status              text NOT NULL DEFAULT 'review' CHECK (status IN ('review', 'pending', 'active', 'completed', 'replied', 'bounced', 'unsubscribed')),
  current_step        integer NOT NULL DEFAULT 0,
  next_send_at        timestamptz,
  source              text NOT NULL DEFAULT 'audience' CHECK (source IN ('csv', 'api', 'audience', 'approved_draft')),
  audience_id         uuid REFERENCES public.sales_audience(id) ON DELETE SET NULL,
  sales_outreach_id   uuid REFERENCES public.sales_outreach(id) ON DELETE SET NULL,
  opening             text,
  opening_source      text CHECK (opening_source IS NULL OR opening_source IN ('draft', 'person')),
  approved_by         text,
  approved_at         timestamptz,
  thread_id           text,
  first_subject       text,
  last_message_id     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, email)
);
CREATE INDEX IF NOT EXISTS sales_campaign_contacts_due_idx ON public.sales_campaign_contacts (next_send_at) WHERE status = 'active';
-- A person is live in one campaign at a time.
CREATE UNIQUE INDEX IF NOT EXISTS sales_campaign_contacts_one_live_idx ON public.sales_campaign_contacts (lower(email)) WHERE status IN ('review', 'pending', 'active');

CREATE TABLE IF NOT EXISTS public.sales_sends (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id           uuid NOT NULL REFERENCES public.sales_campaign_contacts(id) ON DELETE CASCADE,
  campaign_id          uuid NOT NULL REFERENCES public.sales_campaigns(id) ON DELETE CASCADE,
  step_number          integer NOT NULL,
  status               text NOT NULL CHECK (status IN ('sent', 'failed')),
  error                text,
  provider             text,
  provider_message_id  text,
  sent_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_sends_contact_idx ON public.sales_sends (contact_id);
CREATE INDEX IF NOT EXISTS sales_sends_day_idx ON public.sales_sends (sent_at) WHERE status = 'sent';

NOTIFY pgrst, 'reload schema';
