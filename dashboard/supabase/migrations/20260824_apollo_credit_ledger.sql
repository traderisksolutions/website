-- Apollo credit ledger for the automated daily discovery cron (api/cron/daily-lead-discovery).
-- One row per calendar month, incremented as credits are spent (company enrich + people
-- found + emails revealed, each counted as an approximate proxy — see src/lib/apollo-budget.ts
-- for why this is a self-imposed estimate, not a mirror of Apollo's real account balance).
-- No metering of any kind existed in this codebase before this.

CREATE TABLE IF NOT EXISTS public.ob_apollo_credit_usage (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  month        text        NOT NULL UNIQUE, -- 'YYYY-MM'
  credits_used integer     NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
