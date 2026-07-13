-- Employees as contacts (#1) — so staff can email one another from the dashboard
-- and appear in the reply-editor recipient autocomplete (#2), while staying OUT of
-- the lead-oriented Active Contacts lists, stage counts, and funnel analytics.
--
-- is_employee is the reliable filter: the Active Contacts list already only shows
-- source='manual', and stage tabs key off engagement_stage (null for staff), but the
-- explicit flag lets autocomplete label them and lets any future view exclude them.

alter table contacts
  add column if not exists is_employee boolean not null default false;

create index if not exists contacts_is_employee_idx on contacts (is_employee) where is_employee;

-- Seed the current team (source='email' is a known-valid value; the flag does the work).
-- Idempotent: existing rows (e.g. operations@, developer@) are flagged + name-filled.
insert into contacts (email, first_name, last_name, source, is_employee) values
  ('angela@trade-risksol.com',            'Angela',    'Lu',        'email', true),
  ('catherine.lim@trade-risksol.com',     'Catherine', 'Lim',       'email', true),
  ('chengsou.tan@trade-risksol.com',      'Cheng Sou', 'Tan',       'email', true),
  ('manager.mis@trade-risksol.com',       'Dex',       'Chia',      'email', true),
  ('fuzu.zeng@trade-risksol.com',         'Fuzu',      'Zeng',      'email', true),
  ('hasya@trade-risksol.com',             'Hasya',     'Hasnizam',  'email', true),
  ('developer@trade-risksol.com',         'Jarod',     'Hong',      'email', true),
  ('jay.goh@trade-risksol.com',           'Jay',       'Goh',       'email', true),
  ('ken.zeng@trade-risksol.com',          'Ken',       'Zeng',      'email', true),
  ('nathan.budiutomo@trade-risksol.com',  'Nathan',    'Budiutomo', 'email', true),
  ('operations@trade-risksol.com',        'Operations','Team',      'email', true),
  ('road-plus@trade-risksol.com',         'RoadPlus',  'TRS',       'email', true)
on conflict (email) do update
  set is_employee = true,
      first_name  = coalesce(nullif(excluded.first_name, ''), contacts.first_name),
      last_name   = coalesce(nullif(excluded.last_name,  ''), contacts.last_name);
