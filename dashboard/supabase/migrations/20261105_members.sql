-- Phase 4 data readers (5 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- policy_members gains what an insurer's member listing or a client's census states per member:
-- the masked identity, plan and premium, the effective dates, and the document it was read from.
-- 'listing' is a member read off an insurer listing after inception (a census seeds at bind).
-- claims.opened_mode gains 'from_document': a settled claim TRS held no case for, opened from the
-- insurer's settlement letter so the loss ratio counts it.

alter table public.policy_members add column if not exists id_masked          text;
alter table public.policy_members add column if not exists annual_premium     numeric(12,2);
alter table public.policy_members add column if not exists products           text[] not null default '{}';
alter table public.policy_members add column if not exists effective_from     date;
alter table public.policy_members add column if not exists effective_to       date;
alter table public.policy_members add column if not exists listing_date       date;
alter table public.policy_members add column if not exists source_document_id uuid;
alter table public.policy_members drop constraint if exists policy_members_source_check;
alter table public.policy_members add constraint policy_members_source_check check (source in ('census', 'movement', 'manual', 'listing'));
create index if not exists policy_members_source_doc_idx on public.policy_members(source_document_id) where source_document_id is not null;

alter table public.claims drop constraint if exists claims_opened_mode_check;
alter table public.claims add constraint claims_opened_mode_check check (opened_mode in ('normal', 'from_forward', 'midway', 'manual', 'from_document'));
alter table public.claims add column if not exists paid_at date;
alter table public.claims add column if not exists source_document_id uuid;

notify pgrst, 'reload schema';
