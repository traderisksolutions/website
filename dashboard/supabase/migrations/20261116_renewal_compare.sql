-- Renewal Season: the wish list's two kinds and the comparison a person fills (16 Nov 2026).
-- Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- work_item_notes.need        on a wish: 'must' the client must have it, 'nice' it would be good to have.
--                             Null on every other note and on a wish no one has graded.
-- work_item_comparisons       one comparison per case, typed by a person: the options (the current policy
--                             and each quotation, with the file it was read from), the rows of policy terms
--                             with one cell per option, how each option meets each wish, the option
--                             recommended and the reason. Code only counts and subtracts.

alter table public.work_item_notes add column if not exists need text;
alter table public.work_item_notes drop constraint if exists work_item_notes_need_check;
alter table public.work_item_notes add constraint work_item_notes_need_check check (need is null or need in ('must', 'nice'));

create table if not exists public.work_item_comparisons (
  work_item_id uuid primary key references public.work_items(id) on delete cascade,
  options      jsonb not null default '[]'::jsonb,
  rows         jsonb not null default '[]'::jsonb,
  wishes       jsonb not null default '{}'::jsonb,
  recommended  text,
  note         text,
  updated_by   text,
  updated_at   timestamptz not null default now()
);

grant all on table public.work_item_notes       to service_role;
grant all on table public.work_item_comparisons to service_role;

notify pgrst, 'reload schema';
