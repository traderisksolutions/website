-- Nexus chat learnings — structured facts/Q&A extracted from a case's Ask-Opus chat
-- conversations, nightly. Two consumers, per the intended design:
--   1. Case-scoped: that SAME case's next Grand Analysis (Phase 1 evidence synthesis and
--      Phase 2/3 strategy/drafting) reads its own rows so the broker doesn't have to
--      re-ask what was already discussed in chat.
--   2. Pooled: Engagement's prompt-synthesis loop (SkillSynthesizer) reads rows across
--      ALL cases, grouped by `email_type`, alongside draft_evaluations-derived learnings,
--      so recurring patterns improve general Engagement drafting instructions.
-- Nothing here ever triggers a re-analysis automatically — rows are just read lazily
-- whenever the next natural Phase 1/2/3 run or synthesis cycle happens.

create table if not exists nexus_chat_learnings (
  id          uuid        primary key default gen_random_uuid(),
  case_id     uuid        not null,
  email_type  text,       -- best-guess relevant Engagement surface (PRICING/CLAIMS/...), or null
  question    text        not null,
  answer      text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists nexus_chat_learnings_case_id_idx
  on nexus_chat_learnings (case_id, created_at desc);

create index if not exists nexus_chat_learnings_email_type_idx
  on nexus_chat_learnings (email_type, created_at desc);
