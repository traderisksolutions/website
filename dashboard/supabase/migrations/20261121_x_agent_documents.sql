-- AI Agents: instructions and knowledge as versioned text (21 Nov 2026; Jarod's approved design).
-- Additive; safe to re-run. Apply with the runner on Jarod's go. Named to sort after
-- 20261121_w_eb_quotation_insurers.sql.
--
-- One row per saved version. doc_key: 'agent:<agent id>' for an agent's instructions and guardrails,
-- 'kn:<key>' for a knowledge text (kn:tone is read by every agent). The newest version is the one in
-- force; restoring an old version saves it again as the newest. Read by callGemini
-- (src/lib/agents/documents.ts guidanceFor), which records the versions used on each call.

create table if not exists public.agent_documents (
  id          uuid primary key default gen_random_uuid(),
  doc_key     text not null check (doc_key ~ '^(agent|kn):[a-z_]+$'),
  version     integer not null check (version > 0),
  body        text not null,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  unique (doc_key, version)
);

create index if not exists agent_documents_key_idx on public.agent_documents (doc_key, version desc);

grant all on table public.agent_documents to service_role;
