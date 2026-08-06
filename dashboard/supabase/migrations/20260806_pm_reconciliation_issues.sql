-- Pricing Matrix — normalized reconciliation issue log + synthesized summaries.
--
-- Reconciliation conflicts (Opus vs Gemini disagreements on a rule or a benefit term) previously
-- lived inline in pm_rate_tables.accuracy.rule_conflicts / pm_benefit_terms.accuracy.conflicts —
-- a JSON blob that gets overwritten wholesale on every resolve, with no record of who resolved
-- what or when. This table replaces that as the working set: one row per issue, with a real
-- status + resolved_by/resolved_at. pm_rate_tables.accuracy / pm_benefit_terms.accuracy keep the
-- summary COUNTS (agreed/conflicts/adjudicated) — those stay useful as a stat, just not as the
-- live queue.
--
-- Also adds two synthesized-summary columns on pm_calculators, both generated deterministically
-- (plain templating over already-extracted structured data, no AI, no re-reading source files) at
-- approve time: a human-readable "how this calculator prices" summary, and a version-over-version
-- "what changed since the last approved version" summary.
--
-- Run in the Supabase SQL editor (after 20260729_pm_rate_tables.sql).

create table if not exists pm_reconciliation_issues (
  id             uuid primary key default gen_random_uuid(),
  calculator_id  uuid not null references pm_calculators(id) on delete cascade,
  kind           text not null check (kind in ('rule','term')),

  -- 'rule' issues: field = the Rules key in dispute (e.g. 'gst', 'group_size_loading').
  -- 'term' issues: category/label describe the benefit; dedupe_key = termKey() (plan_code|category|label).
  field          text,
  category       text,
  label          text,
  dedupe_key     text,

  opus_value     jsonb,
  gemini_value   jsonb,
  note           text,

  status         text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolution     jsonb,
  resolved_by    uuid,
  resolved_at    timestamptz,

  created_at     timestamptz not null default now()
);
create index if not exists pm_reconciliation_issues_calc_idx on pm_reconciliation_issues (calculator_id, status);

alter table pm_calculators add column if not exists analysis_summary text;
alter table pm_calculators add column if not exists change_summary  jsonb;
