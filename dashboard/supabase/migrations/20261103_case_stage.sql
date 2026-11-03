-- Case stage (3 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- One stage per quote case (new request or renewal), the same nine for every line:
-- request → data_complete → sent_to_insurers → terms_received → comparison_sent →
-- client_decides → bind → policy_and_dn → paid. Derived by rule from the placement, the
-- document register and the debit note (src/lib/cases/stage.ts); the case worker sets it only
-- when no record exists yet (a conversation picked up midway). status keeps saying whose turn it is.
alter table public.work_items add column if not exists stage        text;
alter table public.work_items add column if not exists stage_at     timestamptz;
alter table public.work_items add column if not exists start_point  text;
alter table public.work_items add column if not exists placement_id uuid references public.placements(id) on delete set null;
alter table public.work_items add column if not exists renewal_flow text;
alter table public.work_items drop constraint if exists work_items_stage_check;
alter table public.work_items add constraint work_items_stage_check check (stage is null or stage in
  ('request', 'data_complete', 'sent_to_insurers', 'terms_received', 'comparison_sent', 'client_decides', 'bind', 'policy_and_dn', 'paid'));
alter table public.work_items drop constraint if exists work_items_start_point_check;
alter table public.work_items add constraint work_items_start_point_check check (start_point is null or start_point in ('new_request', 'midway', 'renewal'));
alter table public.work_items drop constraint if exists work_items_renewal_flow_check;
alter table public.work_items add constraint work_items_renewal_flow_check check (renewal_flow is null or renewal_flow in ('hold', 'adjust', 'increase', 'no_data'));
create index if not exists work_items_placement_idx on public.work_items(placement_id) where placement_id is not null;
create index if not exists work_items_stage_idx on public.work_items(stage) where closed_at is null;
notify pgrst, 'reload schema';
