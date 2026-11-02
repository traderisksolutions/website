-- Document register (3 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- One row per document a matter needs before it can be bound, filed or endorsed: the signed
-- proposal form, the slip signed beside the insurer's stamp, the letter of undertaking when cover
-- is backdated, the client's instruction, an appointment letter, a no-change confirmation after a
-- lapse, the bond deed and resolution. src/lib/admin/b/documents decides what is needed and reads
-- what has arrived; the chaser asks for the rest; the relay withholds the bind until complete.
create table if not exists public.work_item_documents (
  id           uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  kind         text not null,
  status       text not null default 'needed' check (status in ('needed', 'requested', 'received', 'waived')),
  owed_by      text not null default 'client' check (owed_by in ('client', 'insurer', 'trs', 'partner')),
  basis        text,
  due_on       date,
  requested_at timestamptz,
  received_at  timestamptz,
  message_id   uuid,
  filename     text,
  waived_by    text,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (work_item_id, kind)
);
create index if not exists work_item_documents_open_idx on public.work_item_documents(status) where status in ('needed', 'requested');
grant all on table public.work_item_documents to service_role;
notify pgrst, 'reload schema';
