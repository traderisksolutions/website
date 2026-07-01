-- Nexus Analysis V1 — add structured_analysis jsonb column for the new 11-section contract
-- Backwards compatible: existing historical_timeline / playbook / etc. columns are preserved.

alter table case_analyses
  add column if not exists structured_analysis jsonb,
  add column if not exists schema_version text default 'legacy';

-- Index for fast JSONB queries on the structured analysis
create index if not exists idx_case_analyses_structured
  on case_analyses using gin (structured_analysis);
