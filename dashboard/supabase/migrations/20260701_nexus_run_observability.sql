-- Nexus analysis run observability — lightweight additions to case_analyses.
-- All columns nullable / have defaults so existing rows are unaffected.

alter table case_analyses
  add column if not exists run_status      text    default 'completed',  -- completed | failed | partial
  add column if not exists run_duration_ms integer,                      -- wall-clock ms from start to DB write
  add column if not exists triggered_by    text;                         -- user email or 'system', null if unknown

-- Lightweight index for fast history queries (latest N runs per case)
create index if not exists idx_case_analyses_case_created
  on case_analyses (case_id, created_at desc);
