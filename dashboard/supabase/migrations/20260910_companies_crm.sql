-- Companies-first CRM (gut renovation, 10 Sep 2026). Run in the Supabase SQL editor.
--
-- Every statement is additive and idempotent, so it is safe to re-run. It also re-applies the
-- two additive columns from 20260901 (ai_drafts.context_used) and 20260907 (cases.company_id)
-- because neither had reached the hosted database when this was written.
--
-- What changes:
--   1. companies gains a lifecycle stage, a kind (client / insurer / partner / other), an
--      account owner, a list of email domains, and a slot for the saved AI brief.
--   2. company_actions — requests / next actions per company (manual, AI-proposed, or system).
--   3. company_link_suggestions — AI proposals for threads that have no company yet, reviewed
--      by staff before anything is linked or created.
--   4. chat_threads.company_id — the Opus chat dock can be scoped to a company, not only a case.
--   5. Backfill of email_threads.company_id and contacts.company_id by contact link and by
--      email domain (exact matches only — everything else waits for the triage queue).

-- ── 1. companies ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS kind             text        NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS stage            text        NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS owner_email      text,
  ADD COLUMN IF NOT EXISTS domains          text[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source           text,
  ADD COLUMN IF NOT EXISTS ai_brief         jsonb,
  ADD COLUMN IF NOT EXISTS ai_brief_at      timestamptz,
  ADD COLUMN IF NOT EXISTS ai_brief_model   text;

DO $$ BEGIN
  ALTER TABLE public.companies
    ADD CONSTRAINT companies_kind_check CHECK (kind IN ('client', 'insurer', 'partner', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.companies
    ADD CONSTRAINT companies_stage_check CHECK (stage IN ('lead', 'prospect', 'quoting', 'client', 'renewal_due', 'lapsed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing rows were all created from debit notes, so "client" (the column default) is right.
-- Seed the domain list from the single legacy `domain` column where one was recorded.
UPDATE public.companies
SET    domains = ARRAY[lower(btrim(domain))]
WHERE  domain IS NOT NULL AND btrim(domain) <> '' AND cardinality(domains) = 0;

CREATE INDEX IF NOT EXISTS companies_stage_idx   ON public.companies (stage);
CREATE INDEX IF NOT EXISTS companies_kind_idx    ON public.companies (kind);
CREATE INDEX IF NOT EXISTS companies_domains_gin ON public.companies USING gin (domains);

-- ── 2. Re-apply pending additive columns from earlier migrations ──────────────────────────────
ALTER TABLE public.ai_drafts
  ADD COLUMN IF NOT EXISTS context_used jsonb;

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS email_threads_company_id_idx
  ON public.email_threads (company_id) WHERE company_id IS NOT NULL;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cases_company_id_idx
  ON public.cases (company_id) WHERE company_id IS NOT NULL;

-- ── 3. chat_threads.company_id ────────────────────────────────────────────────────────────────
ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS chat_threads_company_id_idx
  ON public.chat_threads (company_id) WHERE company_id IS NOT NULL;

-- ── 4. company_actions ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_actions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  detail        text,
  kind          text        NOT NULL DEFAULT 'general'
                            CHECK (kind IN ('renewal', 'claim', 'rfq', 'payment', 'general')),
  status        text        NOT NULL DEFAULT 'open'
                            CHECK (status IN ('proposed', 'open', 'done', 'dismissed')),
  priority      text        NOT NULL DEFAULT 'medium'
                            CHECK (priority IN ('high', 'medium', 'low')),
  due_date      date,
  owner_email   text,
  thread_id     uuid        REFERENCES public.email_threads(id) ON DELETE SET NULL,
  debit_note_id uuid        REFERENCES public.debit_notes(id)   ON DELETE SET NULL,
  source        text        NOT NULL DEFAULT 'manual'
                            CHECK (source IN ('manual', 'ai', 'system')),
  evidence      text,
  created_by    text,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_actions_company_idx ON public.company_actions (company_id, status);
CREATE INDEX IF NOT EXISTS company_actions_due_idx     ON public.company_actions (due_date) WHERE status IN ('open', 'proposed');

DROP TRIGGER IF EXISTS trg_company_actions_updated ON public.company_actions;
CREATE TRIGGER trg_company_actions_updated
  BEFORE UPDATE ON public.company_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.company_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_company_actions ON public.company_actions;
CREATE POLICY staff_company_actions ON public.company_actions
  USING (auth.role() = 'authenticated');
GRANT ALL ON TABLE public.company_actions TO anon;
GRANT ALL ON TABLE public.company_actions TO authenticated;
GRANT ALL ON TABLE public.company_actions TO service_role;

-- ── 5. company_link_suggestions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_link_suggestions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id            uuid        NOT NULL UNIQUE REFERENCES public.email_threads(id) ON DELETE CASCADE,
  verdict              text        NOT NULL
                                   CHECK (verdict IN ('existing', 'new', 'not_client', 'unsure')),
  suggested_company_id uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  suggested_name       text,
  suggested_domain     text,
  confidence           numeric,
  rationale            text,
  status               text        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'accepted', 'rejected')),
  model                text,
  decided_by           text,
  decided_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_link_suggestions_status_idx ON public.company_link_suggestions (status);

DROP TRIGGER IF EXISTS trg_company_link_suggestions_updated ON public.company_link_suggestions;
CREATE TRIGGER trg_company_link_suggestions_updated
  BEFORE UPDATE ON public.company_link_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.company_link_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_company_link_suggestions ON public.company_link_suggestions;
CREATE POLICY staff_company_link_suggestions ON public.company_link_suggestions
  USING (auth.role() = 'authenticated');
GRANT ALL ON TABLE public.company_link_suggestions TO anon;
GRANT ALL ON TABLE public.company_link_suggestions TO authenticated;
GRANT ALL ON TABLE public.company_link_suggestions TO service_role;

-- ── 6. Backfill (exact matches only) ──────────────────────────────────────────────────────────
-- 6a. contacts.company_id from the company_contacts junction (older links).
UPDATE public.contacts c
SET    company_id = cc.company_id
FROM   public.company_contacts cc
WHERE  cc.contact_id = c.id AND c.company_id IS NULL;

-- 6b. contacts.company_id by email domain against a client company's domain list.
UPDATE public.contacts c
SET    company_id = co.id
FROM   public.companies co
WHERE  c.company_id IS NULL
  AND  c.email IS NOT NULL
  AND  co.kind = 'client'
  AND  lower(split_part(c.email, '@', 2)) = ANY (co.domains);

-- 6c. email_threads.company_id from the thread's contact.
UPDATE public.email_threads et
SET    company_id = c.company_id
FROM   public.contacts c
WHERE  et.contact_id = c.id
  AND  c.company_id IS NOT NULL
  AND  et.company_id IS NULL;

-- 6d. cases.company_id from the earliest linked thread (same rule as 20260907).
UPDATE public.cases c
SET    company_id = sub.company_id
FROM (
  SELECT DISTINCT ON (ct.case_id) ct.case_id, et.company_id
  FROM   public.case_threads ct
  JOIN   public.email_threads et ON et.id = ct.thread_id
  WHERE  et.company_id IS NOT NULL
  ORDER  BY ct.case_id, ct.created_at ASC
) sub
WHERE c.id = sub.case_id AND c.company_id IS NULL;
