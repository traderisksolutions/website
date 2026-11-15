-- Case brief and document checklists (15 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- line_checklists        one list per line of insurance: the documents a quote on that line needs. A list is a
--                        draft until a person confirms it; an edit returns it to draft.
-- line_checklist_items   the documents on a list, and how code finds each on a case: by a file's name, by a client
--                        wish on the brief, or only by a person.
-- work_item_checklist    a person's calls on one case: confirmed, not needed, and findings they turned down.
--                        What code finds is worked out on every read and never stored.
-- work_items.product_line  the case's line of insurance when a person sets it (else read from the policy or title).

create table if not exists public.line_checklists (
  line          text primary key,
  confirmed_by  text,
  confirmed_at  timestamptz,
  updated_by    text,
  updated_at    timestamptz not null default now()
);

create table if not exists public.line_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  line        text not null references public.line_checklists(line) on delete cascade,
  label       text not null,
  found_by    text not null default 'file',
  doc_types   text[] not null default '{}',     -- document types (src/lib/documents/taxonomy.ts) a file name may say
  words       text[] not null default '{}',     -- words in a file name that also count
  position    int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
alter table public.line_checklist_items drop constraint if exists line_checklist_items_found_by_check;
alter table public.line_checklist_items add constraint line_checklist_items_found_by_check check (found_by in ('file', 'wish', 'person'));
create unique index if not exists line_checklist_items_label_key on public.line_checklist_items(line, lower(label));

create table if not exists public.work_item_checklist (
  work_item_id  uuid not null references public.work_items(id) on delete cascade,
  item_id       uuid not null references public.line_checklist_items(id) on delete cascade,
  status        text,                             -- null: only turned-down findings are held
  message_id    uuid references public.email_messages(id) on delete set null,
  filename      text,
  found         boolean not null default false,   -- code had found the document when the person confirmed
  rejected      jsonb not null default '[]'::jsonb, -- [{ message_id, filename }] findings a person turned down
  actor         text not null,
  at            timestamptz not null default now(),
  primary key (work_item_id, item_id)
);
alter table public.work_item_checklist drop constraint if exists work_item_checklist_status_check;
alter table public.work_item_checklist add constraint work_item_checklist_status_check check (status is null or status in ('confirmed', 'not_needed'));
create index if not exists work_item_checklist_item_idx on public.work_item_checklist(item_id);

alter table public.work_items add column if not exists product_line    text;
alter table public.work_items add column if not exists product_line_by text;

-- The five draft lists. A line is seeded only while it holds no item, so a re-run never undoes an edit.
insert into public.line_checklists (line) values ('employee_benefits'), ('group_travel'), ('commercial_vehicle'), ('do'), ('wica')
on conflict (line) do nothing;

insert into public.line_checklist_items (line, label, found_by, doc_types, words, position)
select s.line, s.label, s.found_by, s.doc_types, s.words, s.position
from (values
  ('employee_benefits',  'Census',                                 'file',   array['member_list'],                                             array[]::text[],                         1),
  ('employee_benefits',  'Last year''s schedule and benefits',      'file',   array['policy_schedule', 'benefit_summary'],                      array[]::text[],                         2),
  ('employee_benefits',  'Last year''s premium',                    'file',   array['insurer_debit_note', 'trs_debit_note', 'renewal_notice'],  array['premium'],                        3),
  ('employee_benefits',  'Claims experience',                      'file',   array['claims_history'],                                          array[]::text[],                         4),
  ('employee_benefits',  'Client wish list',                       'wish',   array[]::text[],                                                  array[]::text[],                         5),
  ('group_travel',       'Census',                                 'file',   array['member_list'],                                             array[]::text[],                         1),
  ('group_travel',       'This year''s and last year''s benefits',  'file',   array['benefit_summary', 'policy_schedule'],                      array[]::text[],                         2),
  ('commercial_vehicle', 'Vehicle list',                           'file',   array[]::text[],                                                  array['vehicle', 'fleet', 'log card'],   1),
  ('commercial_vehicle', 'Claims history',                         'file',   array['claims_history'],                                          array[]::text[],                         2),
  ('commercial_vehicle', 'Workshop requirement',                   'person', array[]::text[],                                                  array[]::text[],                         3),
  ('do',                 'Proposal form',                          'file',   array['proposal_form'],                                           array[]::text[],                         1),
  ('do',                 'Financial statements',                   'file',   array['company_documents'],                                       array['financial statement'],            2),
  ('do',                 'Claims declaration',                     'file',   array['claims_history'],                                          array[]::text[],                         3),
  ('wica',               'Headcount and wages by occupation',      'file',   array['member_list'],                                             array['wage', 'payroll'],                1),
  ('wica',               'Claims history',                         'file',   array['claims_history'],                                          array[]::text[],                         2)
) as s(line, label, found_by, doc_types, words, position)
where not exists (select 1 from public.line_checklist_items i where i.line = s.line);

grant all on table public.line_checklists      to service_role;
grant all on table public.line_checklist_items to service_role;
grant all on table public.work_item_checklist  to service_role;

notify pgrst, 'reload schema';
