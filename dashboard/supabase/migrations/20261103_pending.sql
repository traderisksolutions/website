-- Pending (3 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
-- How urgent an open case is, computed by src/lib/today/pending.ts and stored here so crons and
-- the home map read the same answer. A person may override the level; the override wins.
alter table public.work_items add column if not exists pending_level           text;
alter table public.work_items add column if not exists pending_reason          text;
alter table public.work_items add column if not exists pending_since           date;
alter table public.work_items add column if not exists pending_due             date;
alter table public.work_items add column if not exists pending_override        text;
alter table public.work_items add column if not exists pending_override_reason text;
alter table public.work_items add column if not exists pending_override_by     text;
alter table public.work_items add column if not exists pending_computed_at     timestamptz;
alter table public.work_items drop constraint if exists work_items_pending_level_check;
alter table public.work_items add constraint work_items_pending_level_check
  check (pending_level is null or pending_level in ('red', 'amber', 'green', 'grey'));
alter table public.work_items drop constraint if exists work_items_pending_override_check;
alter table public.work_items add constraint work_items_pending_override_check
  check (pending_override is null or pending_override in ('red', 'amber', 'green', 'grey'));
create index if not exists work_items_pending_idx on public.work_items(pending_level) where closed_at is null;
notify pgrst, 'reload schema';
