-- AI usage: track provider + model so Nexus/Opus spend shows alongside Gemini.
-- The gemini_usage_log table becomes the single AI-usage ledger (Gemini + Opus).
-- Run in the Supabase SQL editor.

alter table gemini_usage_log
  add column if not exists provider text not null default 'gemini',
  add column if not exists model    text;

-- Backfill: existing rows are Gemini. nexus_synthesis ran on Pro, the rest Flash.
update gemini_usage_log set provider = 'gemini' where provider is null;
update gemini_usage_log set model = 'gemini-2.5-pro'
  where model is null and feature = 'nexus_synthesis';
update gemini_usage_log set model = 'gemini-2.5-flash'
  where model is null and feature <> 'nexus_synthesis' and feature <> 'rag_index';

create index if not exists gemini_usage_provider_idx on gemini_usage_log(provider);
create index if not exists gemini_usage_created_idx  on gemini_usage_log(created_at);
