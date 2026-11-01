-- Phase 2: the endorsement loop (3 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- A movement is any mid-term change the client asks for: a member joining or leaving (EB, FWMI,
-- GHS, GPA), a vehicle added or deleted, a named insured, sum insured, location or period change,
-- a cancellation. Movements reported in a window are grouped into ONE batch per policy, sent to
-- the insurer as one email with one sheet, and approved once in Today.
--
--   movement: reported → sent → noted → billed → settled     batch: open → ready → sent → noted → billed → settled

alter table public.policy_movements add column if not exists movement_type text not null default 'member';
alter table public.policy_movements drop constraint if exists policy_movements_type_check;
alter table public.policy_movements add constraint policy_movements_type_check check (movement_type in ('member', 'vehicle', 'insured', 'sum_insured', 'location', 'period', 'cancellation', 'other'));
alter table public.policy_movements add column if not exists subject      text;            -- vehicle registration, location, the thing changed
alter table public.policy_movements add column if not exists batch_id     uuid;
alter table public.policy_movements add column if not exists work_item_id uuid references public.work_items(id) on delete set null;
alter table public.policy_movements add column if not exists read_by      text;            -- sheet, body, model, staff
alter table public.policy_movements add column if not exists quote        text;            -- the client's words it was read from
-- The flow marks movements billed (TRS note issued); the original check did not allow it.
alter table public.policy_movements drop constraint if exists policy_movements_status_check;
alter table public.policy_movements add constraint policy_movements_status_check check (status in ('reported', 'sent', 'noted', 'billed', 'settled', 'cancelled'));
create index if not exists policy_movements_batch_idx on public.policy_movements(batch_id);

create table if not exists public.movement_batches (
  id                  uuid primary key default gen_random_uuid(),
  policy_id           uuid not null references public.policies(id) on delete cascade,
  company_id          uuid not null references public.companies(id) on delete cascade,
  insurer_company_id  uuid references public.companies(id) on delete set null,
  cadence             text not null default 'weekly' check (cadence in ('immediate', 'daily', 'weekly')),
  window_start        date not null,
  window_end          date not null,                  -- the batch closes after this day (SGT)
  status              text not null default 'open' check (status in ('open', 'ready', 'sent', 'noted', 'billed', 'settled', 'cancelled')),
  work_item_id        uuid references public.work_items(id) on delete set null,
  draft_id            uuid references public.ai_drafts(id) on delete set null,
  pair_id             uuid,
  thread_id           uuid references public.email_threads(id) on delete set null,
  sheet_storage_url   text,
  counts              jsonb not null default '{}'::jsonb,   -- {joins, leaves, changes}
  estimate_total      numeric(14,2),
  noted_total         numeric(14,2),
  needs_human         text,
  sent_at             timestamptz,
  noted_at            timestamptz,
  billed_at           timestamptz,
  settled_at          timestamptz,
  chase_count         int not null default 0,
  last_chase_at       timestamptz,
  next_chase_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists movement_batches_policy_idx on public.movement_batches(policy_id, status);
create unique index if not exists movement_batches_open_once on public.movement_batches(policy_id, window_start) where status = 'open';
create index if not exists movement_batches_chase_idx on public.movement_batches(next_chase_at) where status = 'sent';

alter table public.policies add column if not exists endorsement_cadence text not null default 'weekly';
alter table public.policies drop constraint if exists policies_endorsement_cadence_check;
alter table public.policies add constraint policies_endorsement_cadence_check check (endorsement_cadence in ('immediate', 'daily', 'weekly'));

alter table public.policy_transactions add column if not exists batch_id uuid references public.movement_batches(id) on delete set null;
alter table public.policy_transactions add column if not exists trs_note_work_item_id uuid references public.work_items(id) on delete set null;

grant all on table public.movement_batches to service_role;
notify pgrst, 'reload schema';
