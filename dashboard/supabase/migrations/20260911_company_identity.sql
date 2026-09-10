-- Company identity (11 Sep 2026). Run in the Supabase SQL editor. Safe to re-run.
--
-- One company, many names. A client shows up as "Mister Mobile", "Mister Mobile Yishun" and
-- "Mister Mobile Trading Pte Ltd" in different subject lines; Healthway appears as both a Group
-- and a Corporation Limited. Rather than creating a company for each spelling, every spelling we
-- have ever confirmed is stored as an alias pointing at the one company, so the next email that
-- uses any of them files itself. Email domain remains the strongest link (companies.domains);
-- aliases cover the mail where no client address appears at all, such as an insurer writing to us
-- about a named insured.

CREATE TABLE IF NOT EXISTS public.company_aliases (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- The alias exactly as it was seen, for display.
  alias       text        NOT NULL,
  -- Lower-cased, punctuation collapsed, trailing legal suffixes removed. The matching key.
  alias_norm  text        NOT NULL,
  source      text        NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual', 'learned', 'ai', 'seed')),
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One company per normalised alias: the same spelling can never point at two companies.
CREATE UNIQUE INDEX IF NOT EXISTS company_aliases_norm_key ON public.company_aliases (alias_norm);
CREATE INDEX IF NOT EXISTS company_aliases_company_idx     ON public.company_aliases (company_id);

ALTER TABLE public.company_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_company_aliases ON public.company_aliases;
CREATE POLICY staff_company_aliases ON public.company_aliases
  USING (auth.role() = 'authenticated');
GRANT ALL ON TABLE public.company_aliases TO anon;
GRANT ALL ON TABLE public.company_aliases TO authenticated;
GRANT ALL ON TABLE public.company_aliases TO service_role;

-- How a company came to exist, so an automatically created one can be told apart from one a
-- person entered, and how sure we were at the time.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS auto_created     boolean,
  ADD COLUMN IF NOT EXISTS identity_note    text,
  ADD COLUMN IF NOT EXISTS identity_at      timestamptz;

-- Counterparties (insurers, administrators, brokers, law firms) are companies too. Giving them a
-- record is what keeps their domains out of client records: once QBE owns qbe.com, no client can
-- ever claim it. Existing rows predate this and are all clients.
UPDATE public.companies SET auto_created = false WHERE auto_created IS NULL;
