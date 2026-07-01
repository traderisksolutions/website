-- Adds pin flag and error_message to case_analyses for run pruning (item 4)
-- and failed-run recording (item 2).

alter table case_analyses
  add column if not exists pinned        boolean default false,
  add column if not exists error_message text;

-- Composite index to support "fetch all unpinned rows for a case ordered by age" efficiently.
create index if not exists idx_case_analyses_case_pinned_created
  on case_analyses (case_id, pinned, created_at desc);
