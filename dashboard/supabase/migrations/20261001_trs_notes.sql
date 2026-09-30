-- One register for every note TRS has issued: debit notes and credit notes, the historical
-- Drive archive and the rows already in debit_notes. Source of truth for policies-per-company
-- and lifetime value.
--
-- Separate from debit_notes on purpose. debit_notes drives live billing and the calendar;
-- this is the complete historical record, including credit notes, which debit_notes cannot hold.

create table if not exists public.trs_notes (
  id                  uuid primary key default gen_random_uuid(),

  -- Identity. note_no is canonical: "DN260607" / "CN260703", no space, upper case.
  kind                text not null check (kind in ('DN','CN')),
  note_no             text not null,
  issue_date          date,

  -- Who it was issued to. company_name is what the note itself prints; company_id is filled in
  -- once a name is matched to a company record, and stays null until then rather than guessing.
  company_name        text,
  company_id          uuid references public.companies(id) on delete set null,

  -- Money. gross_amount is the premium collected on behalf of the insurer and is what lifetime
  -- value sums. total_amount is what the client actually pays after any fee rebate.
  -- Credit note amounts are stored negative, so lifetime value is sum(gross_amount) with no
  -- special casing and credits net off the client they belong to.
  currency            text not null default 'SGD',
  gross_amount        numeric(14,2),
  fee_rebate          numeric(14,2),
  gst_amount          numeric(14,2),
  commission          numeric(14,2),
  total_amount        numeric(14,2),

  -- Cover.
  insurer             text,
  policy_no           text,
  cover_note_no       text,
  class_of_insurance  text,
  period_start        date,
  period_end          date,
  description         text,

  -- Settlement. Every migrated note is recorded as paid.
  status              text not null default 'paid' check (status in ('paid','unpaid','partially_paid','void')),
  payment_due_date    date,

  -- A credit note names the debit note it credits, where the document says so.
  credits_note_no     text,

  -- Three documents print a number belonging to a different note. note_no is the number the
  -- note is filed under; this is what the document itself printed, kept so it can be checked.
  note_no_printed     text,

  -- Provenance, so any row can be traced back or rolled back as a set.
  source              text not null default 'drive_migration',
  source_bundle       text,
  drive_file_id       text,
  debit_note_id       uuid references public.debit_notes(id) on delete set null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Idempotent import: re-running the migration updates rather than duplicating.
create unique index if not exists trs_notes_note_no_key on public.trs_notes (upper(replace(note_no,' ','')));
create index if not exists trs_notes_company_idx    on public.trs_notes (company_id);
create index if not exists trs_notes_issue_idx      on public.trs_notes (issue_date desc);
create index if not exists trs_notes_kind_idx       on public.trs_notes (kind);
create index if not exists trs_notes_credits_idx    on public.trs_notes (credits_note_no);

alter table public.trs_notes enable row level security;

drop policy if exists trs_notes_staff_read  on public.trs_notes;
drop policy if exists trs_notes_staff_write on public.trs_notes;
create policy trs_notes_staff_read  on public.trs_notes for select to authenticated using (true);
create policy trs_notes_staff_write on public.trs_notes for all    to authenticated using (true) with check (true);
