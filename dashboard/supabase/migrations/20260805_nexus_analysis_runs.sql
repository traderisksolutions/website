-- Nexus phased analysis runs — tracks progress through the 3-phase Grand Analysis
-- (evidence synthesis -> strategy -> drafting/finalize) so each phase can be a small,
-- independent request instead of one long-running call that risks hitting serverless
-- time limits. Each phase's intermediate output is persisted here so a dropped
-- connection or page reload between phases can resume rather than restart.
--
-- phase1_state / phase2_state hold the intermediate NexusPhase1State / NexusPhase2State
-- shapes from src/lib/run-nexus-analysis.ts. Once phase 3 completes, the final result is
-- written to case_analyses as before and case_analysis_id links back to it.

create table if not exists nexus_analysis_runs (
  id               uuid        primary key default gen_random_uuid(),
  case_id          uuid        not null,
  status           text        not null default 'phase1_pending'
    check (status in (
      'phase1_pending', 'phase1_running', 'phase1_done',
      'phase2_running', 'phase2_done',
      'phase3_running',
      'completed', 'failed'
    )),
  triggered_by     text,
  instructions     text,
  thread_ids       jsonb,
  phase1_state     jsonb,
  phase2_state     jsonb,
  error_message    text,
  case_analysis_id uuid references case_analyses(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists nexus_analysis_runs_case_id_idx
  on nexus_analysis_runs (case_id, created_at desc);
