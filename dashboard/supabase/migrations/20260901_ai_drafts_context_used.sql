-- Engagement Customer Profile (KYC/CRM memory layer): the draft route now builds a
-- deterministic (never LLM-self-reported) list of the specific facts/history it drew on when
-- drafting a reply. Storing it alongside the draft lets the UI show staff WHY a draft looks the
-- way it does, so they can verify rather than blindly trust or ignore it.
alter table public.ai_drafts
  add column if not exists context_used jsonb;
