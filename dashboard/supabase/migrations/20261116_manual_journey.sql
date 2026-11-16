-- The manual case journey (16 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- work_item_threads.insurer_company_id   the insurer a person named for one thread of a case. It stands over the
--                                        thread's own company and the insurer its subject names.
-- line_checklist_items.required          false marks a document optional: a case is complete without it.
-- line_checklists 'basic'                the documents every renewal and quote case is checked for, whatever its
--                                        line. A line's own list adds to it.

alter table public.work_item_threads    add column if not exists insurer_company_id uuid references public.companies(id) on delete set null;
alter table public.line_checklist_items add column if not exists required boolean not null default true;

insert into public.line_checklists (line) values ('basic') on conflict (line) do nothing;

-- Seeded only while the list holds no item, so a re-run never undoes an edit.
insert into public.line_checklist_items (line, label, found_by, doc_types, words, position, required)
select s.line, s.label, s.found_by, s.doc_types, s.words, s.position, s.required
from (values
  ('basic', 'Last year''s policy schedule', 'file', array['policy_schedule'],    array[]::text[],                                1, true),
  ('basic', 'Claims history',              'file', array['claims_history'],     array[]::text[],                                2, true),
  ('basic', 'Authorisation form',          'file', array['broker_appointment'], array['authorisation', 'authorization', 'loa'], 3, false)
) as s(line, label, found_by, doc_types, words, position, required)
where not exists (select 1 from public.line_checklist_items i where i.line = s.line);

grant all on table public.work_item_threads    to service_role;
grant all on table public.line_checklist_items to service_role;

notify pgrst, 'reload schema';
