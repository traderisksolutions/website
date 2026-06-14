-- ─────────────────────────────────────────────────────────────
-- Knowledge Base Migration
-- Run AFTER 20260611_outbound_revamp.sql
-- ─────────────────────────────────────────────────────────────

-- 1. Product knowledge table
--    Entries sourced from Google Drive docs or entered manually.
--    product_type matches the Lead Discovery product selector values.
CREATE TABLE IF NOT EXISTS public.ob_knowledge_base (
  id                    uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  product_type          text        NOT NULL
                          CHECK (product_type IN (
                            'Business Assets', 'Business Liabilities',
                            'Workforce', 'API', 'General'
                          )),
  title                 text        NOT NULL,
  content               text        NOT NULL DEFAULT '',
  gdrive_doc_id         text        UNIQUE,          -- Drive file ID; NULL for manual entries
  gdrive_doc_name       text,                        -- original filename in Drive
  gdrive_last_synced_at timestamptz,
  source                text        NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual', 'gdrive')),
  is_active             boolean     NOT NULL DEFAULT true,
  sort_order            integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 2. Product type on campaigns
ALTER TABLE public.ob_campaigns
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'General';

-- 3. Indexes
CREATE INDEX IF NOT EXISTS ob_knowledge_product_type_idx ON public.ob_knowledge_base(product_type);
CREATE INDEX IF NOT EXISTS ob_knowledge_active_idx       ON public.ob_knowledge_base(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS ob_knowledge_gdrive_idx       ON public.ob_knowledge_base(gdrive_doc_id) WHERE gdrive_doc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ob_campaigns_product_type_idx ON public.ob_campaigns(product_type);

-- 4. updated_at trigger
CREATE OR REPLACE TRIGGER ob_knowledge_updated_at
  BEFORE UPDATE ON public.ob_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RLS
ALTER TABLE public.ob_knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_ob_knowledge" ON public.ob_knowledge_base;
CREATE POLICY "staff_ob_knowledge" ON public.ob_knowledge_base
  USING (auth.role() = 'authenticated');

GRANT ALL ON TABLE public.ob_knowledge_base TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- Google Drive naming convention for sync:
--   [Business Assets] Marine Cargo Insurance Guide.gdoc
--   [Business Liabilities] Public Liability Overview.gdoc
--   [Workforce] WIC Product Guide.gdoc
--   [API] API Integration Guide.gdoc
--   [General] TRS Company Overview.gdoc   (or no brackets → defaults to General)
-- ─────────────────────────────────────────────────────────────
