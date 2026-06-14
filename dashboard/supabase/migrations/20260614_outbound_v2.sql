-- =============================================================================
-- TRS Outbound v2 — Additive schema migration
-- Run in Supabase SQL editor
-- Safe: does not drop or alter existing production data
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Ensure base columns exist on ob_campaigns that code depends on
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ob_campaigns
  ADD COLUMN IF NOT EXISTS product_type     text        NOT NULL DEFAULT 'General';

-- v2 additions
ALTER TABLE public.ob_campaigns
  ADD COLUMN IF NOT EXISTS brief_required   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variant_mode     boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_version  integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS paused_at        timestamptz,
  ADD COLUMN IF NOT EXISTS launched_at      timestamptz,
  ADD COLUMN IF NOT EXISTS sender_provider  text        NOT NULL DEFAULT 'instantly';

-- Ensure people_dump has outbound_lead_id column (added in recent code)
ALTER TABLE public.ob_people_dump
  ADD COLUMN IF NOT EXISTS outbound_lead_id uuid REFERENCES public.outbound_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ob_people_dump_outbound_lead_idx
  ON public.ob_people_dump(outbound_lead_id) WHERE outbound_lead_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Campaign Segments — targeting rules per campaign
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_campaign_segments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      uuid        NOT NULL REFERENCES public.ob_campaigns(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  description      text,
  industry         text[],
  geography        jsonb,
  -- { "countries": ["SG","HK"], "cities": [], "regions": [] }
  revenue_min      bigint,
  revenue_max      bigint,
  employee_min     integer,
  employee_max     integer,
  account_tier     text        CHECK (account_tier IN ('enterprise','mid-market','sme','startup')),
  persona_rules    jsonb,
  -- { "seniority_levels": ["VP","Director"], "function_areas": ["Risk","Finance"],
  --   "suggested_titles": ["Head of Risk","CFO"] }
  targeting_notes  text,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ob_campaign_segments_campaign_idx
  ON public.ob_campaign_segments(campaign_id);
CREATE INDEX IF NOT EXISTS ob_campaign_segments_active_idx
  ON public.ob_campaign_segments(campaign_id, is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Campaign Products — multi-product support per campaign
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_campaign_products (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid        NOT NULL REFERENCES public.ob_campaigns(id) ON DELETE CASCADE,
  product_code text        NOT NULL
               CHECK (product_code IN ('assets','liabilities','workforce','api','general')),
  product_name text        NOT NULL,
  priority     integer     NOT NULL DEFAULT 1,
  notes        text,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, product_code)
);

CREATE INDEX IF NOT EXISTS ob_campaign_products_campaign_idx
  ON public.ob_campaign_products(campaign_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Campaign Versions — revision trail for pause/override cycles
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_campaign_versions (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id            uuid        NOT NULL REFERENCES public.ob_campaigns(id) ON DELETE CASCADE,
  version_number         integer     NOT NULL DEFAULT 1,
  status                 text        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','superseded','archived')),
  created_from_pause     boolean     NOT NULL DEFAULT false,
  change_summary         text,
  -- Which segments / leads had products overridden in this version
  product_override_scope jsonb,
  -- { "segment_ids": [], "lead_ids": [], "product_codes": [] }
  created_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, version_number)
);

CREATE INDEX IF NOT EXISTS ob_campaign_versions_campaign_idx
  ON public.ob_campaign_versions(campaign_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Campaign Leads — explicit membership join table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_campaign_leads (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid        NOT NULL REFERENCES public.ob_campaigns(id) ON DELETE CASCADE,
  lead_id         uuid        NOT NULL REFERENCES public.outbound_leads(id) ON DELETE CASCADE,
  segment_id      uuid        REFERENCES public.ob_campaign_segments(id) ON DELETE SET NULL,
  source_type     text        NOT NULL DEFAULT 'manual'
                  CHECK (source_type IN ('manual','refresh_rule','imported','agent_discovery')),
  approval_status text        NOT NULL DEFAULT 'included'
                  CHECK (approval_status IN ('included','excluded','pending')),
  send_status     text        NOT NULL DEFAULT 'unsent'
                  CHECK (send_status IN (
                    'unsent','queued','sent','replied','bounced','unsubscribed','opted_out'
                  )),
  included_by     text,
  included_at     timestamptz NOT NULL DEFAULT now(),
  removed_at      timestamptz,
  last_synced_at  timestamptz,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);

CREATE INDEX IF NOT EXISTS ob_campaign_leads_campaign_idx
  ON public.ob_campaign_leads(campaign_id);
CREATE INDEX IF NOT EXISTS ob_campaign_leads_lead_idx
  ON public.ob_campaign_leads(lead_id);
CREATE INDEX IF NOT EXISTS ob_campaign_leads_segment_idx
  ON public.ob_campaign_leads(segment_id) WHERE segment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ob_campaign_leads_send_status_idx
  ON public.ob_campaign_leads(campaign_id, send_status);
CREATE INDEX IF NOT EXISTS ob_campaign_leads_approval_idx
  ON public.ob_campaign_leads(campaign_id, approval_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Signal Library — reusable, corroborated market / sector signals
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_signal_library (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                  text        NOT NULL CHECK (scope IN ('sector','company')),
  sector                 text,
  company_id             uuid        REFERENCES public.outbound_leads(id) ON DELETE SET NULL,
  signal_type            text        NOT NULL
                         CHECK (signal_type IN (
                           'incident','regulatory','market_event','merger_acquisition',
                           'leadership_change','financial_event','sector_trend','competitor_news'
                         )),
  headline               text        NOT NULL,
  summary                text,
  source_url             text        NOT NULL,
  source_domain          text,
  -- Corroboration: two signals with same group_id and count >= 2 are eligible
  corroboration_group_id uuid,
  corroboration_count    integer     NOT NULL DEFAULT 1,
  published_at           timestamptz,
  discovered_at          timestamptz NOT NULL DEFAULT now(),
  status                 text        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','active','rejected','archived')),
  relevance_notes        text,
  created_by_agent       boolean     NOT NULL DEFAULT false,
  metadata               jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ob_signal_scope_idx
  ON public.ob_signal_library(scope, sector);
CREATE INDEX IF NOT EXISTS ob_signal_status_idx
  ON public.ob_signal_library(status);
CREATE INDEX IF NOT EXISTS ob_signal_corroboration_group_idx
  ON public.ob_signal_library(corroboration_group_id)
  WHERE corroboration_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ob_signal_published_at_idx
  ON public.ob_signal_library(published_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Campaign Signals — snapshots of library signals attached to a campaign
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_campaign_signals (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id              uuid        NOT NULL REFERENCES public.ob_campaigns(id) ON DELETE CASCADE,
  signal_library_id        uuid        REFERENCES public.ob_signal_library(id) ON DELETE SET NULL,
  -- Immutable snapshot at time of attachment
  snapshot_headline        text        NOT NULL,
  snapshot_summary         text,
  snapshot_source_url      text        NOT NULL,
  snapshot_source_domain   text,
  snapshot_published_at    timestamptz,
  snapshot_signal_type     text,
  snapshot_relevance_notes text,
  approval_status          text        NOT NULL DEFAULT 'pending'
                           CHECK (approval_status IN ('pending','approved','rejected')),
  approved_by              text,
  approved_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ob_campaign_signals_campaign_idx
  ON public.ob_campaign_signals(campaign_id);
CREATE INDEX IF NOT EXISTS ob_campaign_signals_approval_idx
  ON public.ob_campaign_signals(campaign_id, approval_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Campaign Briefs — approval gate before sequence generation
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_campaign_briefs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid        NOT NULL REFERENCES public.ob_campaigns(id) ON DELETE CASCADE,
  version_id          uuid        REFERENCES public.ob_campaign_versions(id) ON DELETE SET NULL,
  version_number      integer     NOT NULL DEFAULT 1,
  -- Structured brief content
  products            jsonb       NOT NULL DEFAULT '[]',
  -- [{ "product_code": "assets", "product_name": "Business Assets", "priority": 1, "notes": "" }]
  target_segments     jsonb       NOT NULL DEFAULT '[]',
  -- [{ "segment_id": "...", "name": "...", "summary": "..." }]
  approved_signal_ids jsonb       NOT NULL DEFAULT '[]',
  -- [campaign_signal_id, ...]  — references ob_campaign_signals.id
  messaging_goals     jsonb       NOT NULL DEFAULT '{}',
  -- { "primary_goal": "book call", "tone": "consultative", "differentiators": [], "avoid": [] }
  constraints         jsonb       NOT NULL DEFAULT '{}',
  -- { "max_emails": 3, "allow_ab_test": false, "ab_dimension": null }
  status              text        NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','approved','superseded')),
  approved_by         text,
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ob_campaign_briefs_campaign_idx
  ON public.ob_campaign_briefs(campaign_id);
CREATE INDEX IF NOT EXISTS ob_campaign_briefs_status_idx
  ON public.ob_campaign_briefs(campaign_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Sequence Variants — new multi-variant / A/B aware draft model
--    Runs alongside ob_campaign_sequences (campaigns with variant_mode=true use this)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_sequence_variants (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id             uuid        NOT NULL REFERENCES public.ob_campaigns(id) ON DELETE CASCADE,
  segment_id              uuid        REFERENCES public.ob_campaign_segments(id) ON DELETE SET NULL,
  brief_id                uuid        REFERENCES public.ob_campaign_briefs(id) ON DELETE SET NULL,
  variant_label           text        NOT NULL DEFAULT 'A',
  -- v1 guardrail: one A/B dimension per campaign
  ab_dimension            text        CHECK (ab_dimension IN (
                            'subject_line','opening_hook','cta','product_angle'
                          )),
  ab_group                text        CHECK (ab_group IN ('control','variant')),
  audience_split_pct      integer     CHECK (audience_split_pct BETWEEN 0 AND 100),
  step_count              integer     NOT NULL DEFAULT 3 CHECK (step_count BETWEEN 1 AND 5),
  status                  text        NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','approved','active','paused','archived')),
  is_winner               boolean     NOT NULL DEFAULT false,
  created_by_model        text,
  generation_prompt_hash  text,
  approved_by             text,
  approved_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ob_sequence_variants_campaign_idx
  ON public.ob_sequence_variants(campaign_id);
CREATE INDEX IF NOT EXISTS ob_sequence_variants_segment_idx
  ON public.ob_sequence_variants(segment_id) WHERE segment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ob_sequence_variants_brief_idx
  ON public.ob_sequence_variants(brief_id);
CREATE INDEX IF NOT EXISTS ob_sequence_variants_status_idx
  ON public.ob_sequence_variants(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Sequence Variant Steps
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_sequence_variant_steps (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id        uuid        NOT NULL REFERENCES public.ob_sequence_variants(id) ON DELETE CASCADE,
  step_number       integer     NOT NULL CHECK (step_number BETWEEN 1 AND 5),
  delay_days        integer     NOT NULL DEFAULT 3 CHECK (delay_days BETWEEN 0 AND 90),
  subject           text        NOT NULL DEFAULT '',
  body              text        NOT NULL DEFAULT '',
  cta_type          text        CHECK (cta_type IN (
                      'meeting_request','question','resource_share','soft_close'
                    )),
  opening_hook_type text        CHECK (opening_hook_type IN (
                      'news_reference','sector_trend','direct_value','mutual_connection'
                    )),
  product_angle     text,
  status            text        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','approved')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, step_number)
);

CREATE INDEX IF NOT EXISTS ob_variant_steps_variant_idx
  ON public.ob_sequence_variant_steps(variant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Lead Scores — pre-reveal credit prioritisation
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_lead_scores (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                 uuid          NOT NULL REFERENCES public.outbound_leads(id) ON DELETE CASCADE,
  campaign_id             uuid          REFERENCES public.ob_campaigns(id) ON DELETE SET NULL,
  segment_id              uuid          REFERENCES public.ob_campaign_segments(id) ON DELETE SET NULL,
  company_fit_score       numeric(3,1)  CHECK (company_fit_score BETWEEN 0 AND 10),
  segment_fit_score       numeric(3,1)  CHECK (segment_fit_score BETWEEN 0 AND 10),
  seniority_fit_score     numeric(3,1)  CHECK (seniority_fit_score BETWEEN 0 AND 10),
  title_fit_score         numeric(3,1)  CHECK (title_fit_score BETWEEN 0 AND 10),
  data_confidence_score   numeric(3,1)  CHECK (data_confidence_score BETWEEN 0 AND 10),
  product_relevance_score numeric(3,1)  CHECK (product_relevance_score BETWEEN 0 AND 10),
  overall_score           numeric(4,1),
  score_reasoning         jsonb,
  -- { "company_fit": { "score": 8, "reason": "..." }, ... }
  scored_at               timestamptz   NOT NULL DEFAULT now(),
  created_at              timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ob_lead_scores_lead_idx
  ON public.ob_lead_scores(lead_id);
CREATE INDEX IF NOT EXISTS ob_lead_scores_campaign_idx
  ON public.ob_lead_scores(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ob_lead_scores_overall_idx
  ON public.ob_lead_scores(overall_score DESC NULLS LAST);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Outbound Event Log — immutable append-only audit trail
--     No FKs intentionally: log must survive entity deletion
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_outbound_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    text        NOT NULL,
  -- Canonical event types — enforced at application layer, not via CHECK
  -- to allow extension without schema migrations:
  -- search_created | companies_selected | people_fetched | lead_created
  -- email_revealed | campaign_created | brief_generated | brief_approved
  -- sequence_generated | variant_generated | sequence_approved | launch_started
  -- lead_added_to_sender | send_synced | reply_synced | bounce_synced
  -- campaign_paused | campaign_resumed | product_override_applied
  -- ae_lead_added | ae_lead_removed | ai_reply_classified | human_review_completed
  actor_user_id text,
  entity_type   text,       -- 'campaign' | 'lead' | 'variant' | 'signal' | 'brief' etc.
  entity_id     uuid,
  campaign_id   uuid,
  lead_id       uuid,
  payload       jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ob_events_event_type_idx
  ON public.ob_outbound_events(event_type);
CREATE INDEX IF NOT EXISTS ob_events_campaign_idx
  ON public.ob_outbound_events(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ob_events_lead_idx
  ON public.ob_outbound_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ob_events_entity_idx
  ON public.ob_outbound_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ob_events_created_at_idx
  ON public.ob_outbound_events(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Sender Providers — abstraction layer (Instantly today, extensible)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_sender_providers (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text        NOT NULL UNIQUE,
  display_name  text        NOT NULL,
  api_base_url  text,
  is_active     boolean     NOT NULL DEFAULT true,
  capabilities  jsonb       NOT NULL DEFAULT '{}',
  -- { "supports_webhooks": true, "supports_sequences": true, "supports_ab": false }
  created_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ob_sender_providers
  (provider_code, display_name, api_base_url, is_active, capabilities)
VALUES (
  'instantly',
  'Instantly.ai',
  'https://api.instantly.ai/api/v1',
  true,
  '{"supports_webhooks": true, "supports_sequences": true, "supports_ab": false}'
)
ON CONFLICT (provider_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. Sender Campaign Mappings — provider-specific campaign IDs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_sender_campaign_mappings (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id          uuid        NOT NULL REFERENCES public.ob_campaigns(id) ON DELETE CASCADE,
  provider_id          uuid        NOT NULL REFERENCES public.ob_sender_providers(id) ON DELETE RESTRICT,
  provider_campaign_id text        NOT NULL,
  sync_status          text        NOT NULL DEFAULT 'active'
                       CHECK (sync_status IN ('active','paused','error','completed')),
  last_synced_at       timestamptz,
  sync_error           text,
  metadata             jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, provider_id)
);

CREATE INDEX IF NOT EXISTS ob_sender_mappings_campaign_idx
  ON public.ob_sender_campaign_mappings(campaign_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. Reply Events — raw webhook ingest (de-duped by provider + event id)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_reply_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code     text        NOT NULL,
  provider_event_id text,
  campaign_id       uuid        REFERENCES public.ob_campaigns(id) ON DELETE SET NULL,
  lead_id           uuid        REFERENCES public.outbound_leads(id) ON DELETE SET NULL,
  event_type        text        NOT NULL
                    CHECK (event_type IN (
                      'reply','bounce','unsubscribe','open','click','sending_limit'
                    )),
  lead_email        text,
  subject           text,
  body_preview      text,
  raw_payload       jsonb       NOT NULL DEFAULT '{}',
  received_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_code, provider_event_id)
);

CREATE INDEX IF NOT EXISTS ob_reply_events_campaign_idx
  ON public.ob_reply_events(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ob_reply_events_lead_idx
  ON public.ob_reply_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ob_reply_events_event_type_idx
  ON public.ob_reply_events(event_type, received_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. Reply Classifications — AI + human label, review queue
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ob_reply_classifications (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_event_id     uuid        NOT NULL UNIQUE
                     REFERENCES public.ob_reply_events(id) ON DELETE CASCADE,
  campaign_id        uuid        REFERENCES public.ob_campaigns(id) ON DELETE SET NULL,
  lead_id            uuid        REFERENCES public.outbound_leads(id) ON DELETE SET NULL,
  -- AI output
  ai_label           text        CHECK (ai_label IN (
                       'positive','neutral','negative','unsubscribe',
                       'out_of_office','wrong_person','meeting_intent','question'
                     )),
  ai_confidence      numeric(3,2) CHECK (ai_confidence BETWEEN 0 AND 1),
  ai_reasoning       text,
  ai_classified_at   timestamptz,
  ai_model_used      text,
  -- Human review
  human_label        text        CHECK (human_label IN (
                       'positive','neutral','negative','unsubscribe',
                       'out_of_office','wrong_person','meeting_intent','question'
                     )),
  human_reviewed_by  text,
  human_reviewed_at  timestamptz,
  human_notes        text,
  -- final_label: human overrides AI; falls back to AI if no human review
  final_label        text,
  review_status      text        NOT NULL DEFAULT 'pending_ai'
                     CHECK (review_status IN ('pending_ai','pending_human','completed')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ob_reply_classifications_campaign_idx
  ON public.ob_reply_classifications(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ob_reply_classifications_review_status_idx
  ON public.ob_reply_classifications(review_status);
CREATE INDEX IF NOT EXISTS ob_reply_classifications_final_label_idx
  ON public.ob_reply_classifications(final_label);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — Enable and set authenticated-user policies (matches existing pattern)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ob_campaign_segments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_campaign_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_campaign_versions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_campaign_leads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_signal_library         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_campaign_signals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_campaign_briefs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_sequence_variants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_sequence_variant_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_lead_scores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_outbound_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_sender_providers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_sender_campaign_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_reply_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ob_reply_classifications  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_ob_campaign_segments"       ON public.ob_campaign_segments;
DROP POLICY IF EXISTS "auth_ob_campaign_products"       ON public.ob_campaign_products;
DROP POLICY IF EXISTS "auth_ob_campaign_versions"       ON public.ob_campaign_versions;
DROP POLICY IF EXISTS "auth_ob_campaign_leads"          ON public.ob_campaign_leads;
DROP POLICY IF EXISTS "auth_ob_signal_library"          ON public.ob_signal_library;
DROP POLICY IF EXISTS "auth_ob_campaign_signals"        ON public.ob_campaign_signals;
DROP POLICY IF EXISTS "auth_ob_campaign_briefs"         ON public.ob_campaign_briefs;
DROP POLICY IF EXISTS "auth_ob_sequence_variants"       ON public.ob_sequence_variants;
DROP POLICY IF EXISTS "auth_ob_sequence_variant_steps"  ON public.ob_sequence_variant_steps;
DROP POLICY IF EXISTS "auth_ob_lead_scores"             ON public.ob_lead_scores;
DROP POLICY IF EXISTS "auth_ob_outbound_events"         ON public.ob_outbound_events;
DROP POLICY IF EXISTS "auth_ob_sender_providers"        ON public.ob_sender_providers;
DROP POLICY IF EXISTS "auth_ob_sender_campaign_mappings" ON public.ob_sender_campaign_mappings;
DROP POLICY IF EXISTS "auth_ob_reply_events"            ON public.ob_reply_events;
DROP POLICY IF EXISTS "auth_ob_reply_classifications"   ON public.ob_reply_classifications;

CREATE POLICY "auth_ob_campaign_segments"
  ON public.ob_campaign_segments USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_campaign_products"
  ON public.ob_campaign_products USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_campaign_versions"
  ON public.ob_campaign_versions USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_campaign_leads"
  ON public.ob_campaign_leads USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_signal_library"
  ON public.ob_signal_library USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_campaign_signals"
  ON public.ob_campaign_signals USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_campaign_briefs"
  ON public.ob_campaign_briefs USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_sequence_variants"
  ON public.ob_sequence_variants USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_sequence_variant_steps"
  ON public.ob_sequence_variant_steps USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_lead_scores"
  ON public.ob_lead_scores USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_outbound_events"
  ON public.ob_outbound_events USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_sender_providers"
  ON public.ob_sender_providers USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_sender_campaign_mappings"
  ON public.ob_sender_campaign_mappings USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_reply_events"
  ON public.ob_reply_events USING (auth.role() = 'authenticated');
CREATE POLICY "auth_ob_reply_classifications"
  ON public.ob_reply_classifications USING (auth.role() = 'authenticated');

-- Grants
GRANT ALL ON TABLE public.ob_campaign_segments       TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_campaign_products       TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_campaign_versions       TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_campaign_leads          TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_signal_library          TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_campaign_signals        TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_campaign_briefs         TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_sequence_variants       TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_sequence_variant_steps  TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_lead_scores             TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_outbound_events         TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_sender_providers        TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_sender_campaign_mappings TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_reply_events            TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ob_reply_classifications   TO anon, authenticated, service_role;
