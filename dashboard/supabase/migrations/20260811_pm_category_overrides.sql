-- Pricing Matrix — optional per-employee-category plan-tier overrides on a quotation.
-- Shape: { [calculator_id]: { [employee_category]: Selection } } — purely additive; a quote with
-- no overrides behaves exactly as before (buildMembers falls back to the default `selections`).
-- Run in the Supabase SQL editor (after 20260722_pm_quotations.sql).

alter table pm_quotations add column if not exists category_overrides jsonb not null default '{}'::jsonb;
