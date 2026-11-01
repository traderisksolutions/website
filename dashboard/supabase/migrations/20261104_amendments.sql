-- Endorsement amendments (4 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- Clients and insurers change their minds. Nothing is deleted or overwritten: a changed movement
-- is a new version that supersedes the old; a changed batch is a new revision on the same insurer
-- thread; a re-issued insurer note supersedes the earlier transaction; a TRS note raised against
-- a change that was later undone is reversed or corrected by a second TRS note that links back.
--
--   movement:   v1 ──supersedes──▶ v2 (v1 cancelled, reason 'superseded')
--   batch:      revision 1 (sent) ──parent_batch_id──▶ revision 2 (the amendment, same thread)
--   transaction: note A ──supersedes_id──▶ note A' (re-issued); reverses_transaction_id for a credit against A
--   debit note:  DN1 ◀──reverses_debit_note_id── CN2 (reversal) or DN2 (correction, the difference)

alter table public.policy_movements add column if not exists version        int not null default 1;
alter table public.policy_movements add column if not exists supersedes_id  uuid references public.policy_movements(id) on delete set null;
alter table public.policy_movements add column if not exists cancelled_at   timestamptz;
alter table public.policy_movements add column if not exists cancel_reason  text;     -- superseded, client withdrew, insurer rejected, reversed
alter table public.policy_movements add column if not exists reversal_of_transaction_id uuid;  -- the insurer note this movement undoes
create index if not exists policy_movements_supersedes_idx on public.policy_movements(supersedes_id) where supersedes_id is not null;

alter table public.movement_batches add column if not exists revision         int not null default 1;
alter table public.movement_batches add column if not exists parent_batch_id  uuid references public.movement_batches(id) on delete set null;
alter table public.movement_batches add column if not exists sub_state        text;     -- awaiting_client (insurer asked), partial (some noted)
alter table public.movement_batches add column if not exists awaiting_since   timestamptz;
alter table public.movement_batches add column if not exists question         text;     -- what the insurer asked, as written
alter table public.movement_batches drop constraint if exists movement_batches_sub_state_check;
alter table public.movement_batches add constraint movement_batches_sub_state_check check (sub_state is null or sub_state in ('awaiting_client', 'partial'));
-- An open revision has a parent and may share the window of a sent revision: the open-once index
-- keys on the window only; a revision window starts at the amendment day, so two revisions on one
-- day would clash. Revisions are keyed by parent instead.
create index if not exists movement_batches_parent_idx on public.movement_batches(parent_batch_id) where parent_batch_id is not null;

alter table public.policy_transactions add column if not exists supersedes_id            uuid references public.policy_transactions(id) on delete set null;
alter table public.policy_transactions add column if not exists reverses_transaction_id  uuid references public.policy_transactions(id) on delete set null;
alter table public.policy_transactions add column if not exists superseded_at            timestamptz;

alter table public.debit_notes add column if not exists reverses_debit_note_id uuid references public.debit_notes(id) on delete set null;
alter table public.debit_notes add column if not exists reversal_kind          text;     -- reversal (full), correction (the difference)
alter table public.debit_notes drop constraint if exists debit_notes_reversal_kind_check;
alter table public.debit_notes add constraint debit_notes_reversal_kind_check check (reversal_kind is null or reversal_kind in ('reversal', 'correction'));
create index if not exists debit_notes_reverses_idx on public.debit_notes(reverses_debit_note_id) where reverses_debit_note_id is not null;

notify pgrst, 'reload schema';
