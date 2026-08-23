-- Sales Loop v2, Phase 5 (F3) — companies canonical spine at lead intake.
--
-- Today "company" exists as free text on contacts (this column), free text on GB/PM quotations,
-- and a real relational graph (companies/customers/policies) populated only when a Debit Note is
-- raised. Before that point "has this account bought from us before" is a manual search, not a
-- query. This adds a nullable, additive FK so the three lead-creation paths (website, referral,
-- outbound — see src/lib/debit-note-commit.ts's resolveCompany, reused verbatim rather than a
-- second resolver) can link a contact to the real companies row as soon as a lead names one,
-- instead of waiting until billing. contacts.company (free text) stays as the display fallback.
--
-- Explicitly NOT touched here: gb_quotations.company_name / pm_quotations.company_name/company_id
-- — those stay as they are, per the Sales Loop v2 plan's decision to keep this pass scoped to
-- lead intake and not risk the quoting flows.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contacts_company_id_idx ON public.contacts(company_id) WHERE company_id IS NOT NULL;
