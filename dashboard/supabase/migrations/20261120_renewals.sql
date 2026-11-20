-- Renewals, release 1 (20 Nov 2026). Additive; safe to re-run. NOT APPLIED.
-- Apply with ~/trs-dn-migration/apply-sql.sh, on Jarod's go only. docs/renewals.md has the model.
--
-- renewals             one record per policy term being renewed, opened 120 days before expiry
--                      (180 for Employment Benefits). One open record per policy (outcome null).
--                      Closes as renewed (renewed_policy_id set) or lost (loss_reason set).
-- renewal_tasks        the four tasks on a record: 90, 60, 30 and 15 days before expiry.
-- policy_lines         the fixed list of TRS lines of business (src/lib/renewals/lines.ts).
-- policies.line_code   the policy's line, written only when a person confirms it (Renewals › To fix).
-- policy_line_aliases  a class-of-insurance spelling a person confirmed as a line.

create table if not exists public.policy_lines (
  code text primary key,
  name text not null,
  sort integer not null default 0
);

insert into public.policy_lines (code, name, sort) values
  ('eb', 'Employment Benefits', 10),
  ('fwm', 'Foreign Worker Medical', 20),
  ('wica', 'WICA', 30),
  ('gpa', 'Group Personal Accident', 40),
  ('group_travel', 'Group Travel', 50),
  ('pl', 'Public Liability', 60),
  ('pi', 'Professional Indemnity', 70),
  ('do', 'Directors & Officers', 80),
  ('cyber', 'Cyber', 90),
  ('property', 'Property / Fire / IAR', 100),
  ('car', 'Contractors’ All Risks', 110),
  ('marine', 'Marine Cargo', 120),
  ('motor', 'Motor', 130),
  ('bonds', 'Bonds', 140),
  ('trade_credit', 'Trade Credit', 150),
  ('business_package', 'Business Package', 160),
  ('domestic_helper', 'Domestic Helper', 170),
  ('travel', 'Travel', 180),
  ('other', 'Other', 999)
on conflict (code) do update set name = excluded.name, sort = excluded.sort;

alter table public.policies add column if not exists line_code text;
create index if not exists policies_line_code_idx on public.policies (line_code) where line_code is not null;

create table if not exists public.policy_line_aliases (
  spelling     text primary key,             -- lower case, single spaces (spellingKey)
  line_code    text not null references public.policy_lines(code),
  confirmed_by text,
  confirmed_at timestamptz not null default now()
);

create table if not exists public.renewals (
  id                  uuid primary key default gen_random_uuid(),
  policy_id           uuid not null references public.policies(id) on delete cascade,
  company_id          uuid references public.companies(id) on delete set null,
  line_code           text references public.policy_lines(code),
  insurer             text,
  expiry_date         date not null,
  opens_on            date not null,
  expiring_premium    numeric,
  expiring_commission numeric,
  currency            text not null default 'SGD',
  owner               text,
  stage               text not null default 'open'
    check (stage in ('open', 'data_asked', 'marketing', 'quotes_in', 'proposed', 'instructed', 'renewed', 'lost')),
  outcome             text check (outcome is null or outcome in ('renewed', 'lost')),
  loss_reason         text check (loss_reason is null or loss_reason in ('price', 'service', 'no_contact', 'client_closed', 'other')),
  loss_note           text,
  renewed_policy_id   uuid references public.policies(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint renewals_renewed_needs_policy check (outcome is distinct from 'renewed' or renewed_policy_id is not null),
  constraint renewals_lost_needs_reason check (outcome is distinct from 'lost' or loss_reason is not null)
);

create unique index if not exists renewals_one_open_per_policy on public.renewals (policy_id) where outcome is null;
create index if not exists renewals_expiry_idx on public.renewals (expiry_date);
create index if not exists renewals_stage_idx on public.renewals (stage);
create index if not exists renewals_owner_idx on public.renewals (owner);

create table if not exists public.renewal_tasks (
  id         uuid primary key default gen_random_uuid(),
  renewal_id uuid not null references public.renewals(id) on delete cascade,
  kind       text not null check (kind in ('-90', '-60', '-30', '-15')),
  due_on     date not null,
  done_at    timestamptz,
  done_by    text,
  unique (renewal_id, kind)
);
create index if not exists renewal_tasks_due_idx on public.renewal_tasks (due_on) where done_at is null;

grant all on table public.policy_lines, public.policy_line_aliases, public.renewals, public.renewal_tasks to service_role;

notify pgrst, 'reload schema';
