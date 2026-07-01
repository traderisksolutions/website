-- Nexus draft traceability: link ai_drafts records back to the Nexus case + step that created them.
-- Nullable — existing rows and drafts created outside Nexus are unaffected.

alter table ai_drafts
  add column if not exists nexus_case_id    uuid references cases(id) on delete set null,
  add column if not exists nexus_step_index int;

create index if not exists idx_ai_drafts_nexus_case
  on ai_drafts (nexus_case_id)
  where nexus_case_id is not null;
