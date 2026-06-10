-- ─────────────────────────────────────────────────────────────
-- Outbound Revamp Migration
-- Run in Supabase SQL editor
-- ─────────────────────────────────────────────────────────────

-- 1. PDPA/PDPO compliance columns on outbound_leads
ALTER TABLE public.outbound_leads
  ADD COLUMN IF NOT EXISTS opt_out        boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opt_out_at     timestamptz,
  ADD COLUMN IF NOT EXISTS consent_source text        NOT NULL DEFAULT 'public_business_data';

-- 2. ob_search_log: add headcount_ranges + locations array for multi-select
ALTER TABLE public.ob_search_log
  ADD COLUMN IF NOT EXISTS headcount_ranges text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS locations        text[] DEFAULT '{}';

-- 3. ob_company_dump: store Apollo enrichment data
ALTER TABLE public.ob_company_dump
  ADD COLUMN IF NOT EXISTS apollo_id     text,
  ADD COLUMN IF NOT EXISTS website       text,
  ADD COLUMN IF NOT EXISTS employee_count integer,
  ADD COLUMN IF NOT EXISTS industry      text,
  ADD COLUMN IF NOT EXISTS linkedin_url  text;

-- 4. ob_people_dump: store apollo_id
ALTER TABLE public.ob_people_dump
  ADD COLUMN IF NOT EXISTS apollo_id    text,
  ADD COLUMN IF NOT EXISTS title        text;

-- 5. Campaigns table
CREATE TABLE IF NOT EXISTS public.ob_campaigns (
  id                    uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name                  text        NOT NULL,
  search_id             uuid        REFERENCES public.ob_search_log(id) ON DELETE SET NULL,
  status                text        NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','review','active','paused','completed','archived')),
  news_url              text,
  news_headline         text,
  news_summary          text,
  news_fetched_at       timestamptz,
  lead_count            integer     NOT NULL DEFAULT 0,
  sent_count            integer     NOT NULL DEFAULT 0,
  reply_count           integer     NOT NULL DEFAULT 0,
  instantly_campaign_id text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 6. Campaign sequence steps
CREATE TABLE IF NOT EXISTS public.ob_campaign_sequences (
  id          uuid    DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  campaign_id uuid    NOT NULL REFERENCES public.ob_campaigns(id) ON DELETE CASCADE,
  step_number integer NOT NULL CHECK (step_number BETWEEN 1 AND 5),
  subject     text    NOT NULL DEFAULT '',
  body        text    NOT NULL DEFAULT '',
  delay_days  integer NOT NULL DEFAULT 3 CHECK (delay_days BETWEEN 0 AND 90),
  status      text    NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','approved')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, step_number)
);

-- 7. Per-lead per-step send tracking
CREATE TABLE IF NOT EXISTS public.ob_campaign_sends (
  id                uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  campaign_id       uuid        NOT NULL REFERENCES public.ob_campaigns(id) ON DELETE CASCADE,
  sequence_id       uuid        NOT NULL REFERENCES public.ob_campaign_sequences(id) ON DELETE CASCADE,
  outbound_lead_id  uuid        NOT NULL REFERENCES public.outbound_leads(id) ON DELETE CASCADE,
  instantly_email_id text,
  status            text        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','sent','replied','bounced','unsubscribed')),
  sent_at           timestamptz,
  replied_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, outbound_lead_id)
);

-- 8. Indexes
CREATE INDEX IF NOT EXISTS ob_campaigns_status_idx      ON public.ob_campaigns(status);
CREATE INDEX IF NOT EXISTS ob_campaigns_created_at_idx  ON public.ob_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS ob_seq_campaign_idx          ON public.ob_campaign_sequences(campaign_id);
CREATE INDEX IF NOT EXISTS ob_sends_campaign_idx        ON public.ob_campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS ob_sends_lead_idx            ON public.ob_campaign_sends(outbound_lead_id);
CREATE INDEX IF NOT EXISTS ob_sends_status_idx          ON public.ob_campaign_sends(status);
CREATE INDEX IF NOT EXISTS outbound_leads_opt_out_idx   ON public.outbound_leads(opt_out) WHERE opt_out = true;

-- 9. updated_at triggers
CREATE OR REPLACE TRIGGER ob_campaigns_updated_at
  BEFORE UPDATE ON public.ob_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER ob_seq_updated_at
  BEFORE UPDATE ON public.ob_campaign_sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. RLS
ALTER TABLE public.ob_campaigns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_campaign_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_campaign_sends     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_ob_campaigns"     ON public.ob_campaigns          USING (auth.role() = 'authenticated');
CREATE POLICY "staff_ob_sequences"     ON public.ob_campaign_sequences  USING (auth.role() = 'authenticated');
CREATE POLICY "staff_ob_sends"         ON public.ob_campaign_sends      USING (auth.role() = 'authenticated');

GRANT ALL ON TABLE public.ob_campaigns          TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_campaign_sequences TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_campaign_sends     TO anon, authenticated, service_role;
