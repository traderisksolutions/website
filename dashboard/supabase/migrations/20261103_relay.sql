-- Relay agent (3 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- ai_drafts.draft_class  how a draft is grouped for the autonomy ladder: ack, forward, relay,
--                        answer, request, status. An ack can earn auto-send long before a relay.
-- ai_drafts.relay_intent the inbound intent the draft answers (relay/intent.ts).
alter table public.ai_drafts add column if not exists draft_class  text;
alter table public.ai_drafts add column if not exists relay_intent text;
create index if not exists ai_drafts_class_idx on public.ai_drafts(draft_class, status) where draft_class is not null;
notify pgrst, 'reload schema';
