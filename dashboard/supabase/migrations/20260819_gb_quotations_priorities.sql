-- Sales Loop v2, Phase 6a — client priorities input for Group Benefits' recommendation, mirroring
-- pm_quotations' equivalent field. Persisted so "Regenerate" on an already-computed quote reuses
-- what the broker typed rather than losing it.

ALTER TABLE public.gb_quotations
  ADD COLUMN IF NOT EXISTS priorities text;
