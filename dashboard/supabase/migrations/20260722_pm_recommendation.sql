-- Pricing Matrix — Phase 3: context-aware recommendation on a quotation.
-- `priorities` = the broker's optional "what matters to this client" note (later also fed by
-- auto-inferred email-thread focus). `recommendation` = Opus's structured output.
-- Run in the Supabase SQL editor (after 20260722_pm_quotations.sql).

alter table pm_quotations add column if not exists priorities     text;
alter table pm_quotations add column if not exists recommendation jsonb;
