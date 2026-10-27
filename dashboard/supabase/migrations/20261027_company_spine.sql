-- Company spine (27 Oct 2026): the policy is the one record everything hangs off.
--   policies  ← placement lines (quoting) · chosen quote (bound) · debit notes (billing, already)
--             ← members and movements (employment benefits) · transactions (insurer DN/CN) · weekly position
-- Apply with ~/trs-dn-migration/apply-sql.sh, after 20261027_placement.sql.

-- ── policies: company-keyed, with a lifecycle and the chosen quote ──────────────────────────
alter table policies add column if not exists company_id               uuid references companies(id) on delete set null;
alter table policies add column if not exists product_line             text;          -- slug from src/lib/product-lines.ts
alter table policies add column if not exists label                    text;
alter table policies add column if not exists lifecycle                text not null default 'live';
alter table policies add column if not exists placement_line_id        uuid;          -- placement_lines.id that produced it
alter table policies add column if not exists chosen_quote_id          uuid;          -- placement_quotes.id the client went with
alter table policies add column if not exists chosen_insurer_company_id uuid;
alter table policies add column if not exists bound_premium            numeric;
alter table policies add column if not exists bound_at                 timestamptz;
alter table policies add column if not exists bound_by                 text;
alter table policies add column if not exists is_eb                    boolean not null default false;
alter table policies drop constraint if exists policies_lifecycle_check;
alter table policies add constraint policies_lifecycle_check
  check (lifecycle in ('quoting','presented','bound','live','renewal_due','lapsed','declined','closed'));
-- A policy being quoted has no customer record yet; billing creates one when the first note is raised.
alter table policies alter column customer_id drop not null;
update policies p set company_id = c.company_id from customers c where c.id = p.customer_id and p.company_id is null;
update policies set is_eb = true where is_eb = false and class_of_insurance ~* 'employee benefit|group (health|hospital|medical)|group term|GHS|GTL';
create index if not exists policies_company_idx on policies(company_id) where company_id is not null;
create index if not exists policies_lifecycle_idx on policies(lifecycle);

-- ── placement ↔ policy ──────────────────────────────────────────────────────────────────────
alter table placement_lines  add column if not exists policy_id uuid references policies(id) on delete set null;
create index if not exists placement_lines_policy_idx on placement_lines(policy_id) where policy_id is not null;
-- A quote can come from an insurer's reply or from the in-dashboard rate engine (employment benefits tiers A and B).
alter table placement_quotes add column if not exists source         text not null default 'insurer';
alter table placement_quotes add column if not exists engine_run_id  uuid;           -- gb_quotations.id
alter table placement_quotes add column if not exists plan_label     text;
alter table placement_quotes alter column dispatch_id drop not null;
alter table placement_quotes drop constraint if exists placement_quotes_source_check;
alter table placement_quotes add constraint placement_quotes_source_check check (source in ('insurer','rate_table'));
-- Employee lists are asked for per policy, not per engine run.
alter table hr_links add column if not exists policy_id uuid references policies(id) on delete set null;
create index if not exists hr_links_policy_idx on hr_links(policy_id) where policy_id is not null;
alter table placement_lines add column if not exists census_submission_id uuid;      -- hr_submissions.id used for pricing

-- ── employment benefits after bind: who is covered, what moved, what the insurer billed ─────
create table if not exists policy_members (
  id                   uuid primary key default gen_random_uuid(),
  policy_id            uuid not null references policies(id) on delete cascade,
  company_id           uuid not null references companies(id) on delete cascade,
  member_name          text not null,
  relationship         text not null default 'employee' check (relationship in ('employee','spouse','child','other')),
  employee_ref         text,                      -- groups a dependant with the employee
  dob                  date,
  gender               text,
  category             text,                      -- the client's plan category / job band
  plan_code            text,
  joined_on            date,
  left_on              date,
  status               text not null default 'active' check (status in ('active','left')),
  source               text not null default 'census' check (source in ('census','movement','manual')),
  source_submission_id uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists policy_members_policy_idx on policy_members(policy_id, status);

create table if not exists policy_movements (
  id                   uuid primary key default gen_random_uuid(),
  policy_id            uuid not null references policies(id) on delete cascade,
  company_id           uuid not null references companies(id) on delete cascade,
  kind                 text not null check (kind in ('join','leave','change')),
  member_id            uuid references policy_members(id) on delete set null,
  member_name          text not null,
  relationship         text,
  effective_on         date,
  pax                  int not null default 1,
  detail               jsonb not null default '{}'::jsonb,   -- plan, category, dob as reported
  reported_thread_id   uuid,
  reported_message_id  uuid,
  sent_draft_id        uuid,                      -- ai_drafts.id of the request to the insurer
  sent_at              timestamptz,
  transaction_id       uuid,                      -- policy_transactions.id once the insurer's note arrives
  status               text not null default 'reported' check (status in ('reported','sent','noted','settled','cancelled')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists policy_movements_policy_idx on policy_movements(policy_id, status);

-- Every debit and credit note the insurer issues on the policy, read from the email it came on.
create table if not exists policy_transactions (
  id                   uuid primary key default gen_random_uuid(),
  policy_id            uuid not null references policies(id) on delete cascade,
  company_id           uuid not null references companies(id) on delete cascade,
  kind                 text not null check (kind in ('debit','credit')),
  note_no              text,
  issued_on            date,
  pax                  int,
  amount               numeric not null,          -- signed: a credit is negative
  currency             text not null default 'SGD',
  description          text,
  period_start         date,
  period_end           date,
  insurer              text,
  member_names         text[] not null default '{}',
  source_thread_id     uuid,
  source_message_id    uuid,
  source_attachment_id uuid,
  debit_note_id        uuid,                      -- the TRS debit note raised to the client for it, if any
  evidence             jsonb not null default '{}'::jsonb,
  needs_review         boolean not null default false,
  created_at           timestamptz not null default now()
);
create unique index if not exists policy_transactions_note_idx on policy_transactions(policy_id, upper(replace(coalesce(note_no,''),' ',''))) where note_no is not null;
create index if not exists policy_transactions_policy_idx on policy_transactions(policy_id, issued_on);

-- The weekly line: what the insurer billed, what it credited, where the client stands.
create table if not exists policy_position_weekly (
  id            uuid primary key default gen_random_uuid(),
  policy_id     uuid not null references policies(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  week_start    date not null,                    -- Monday
  pax_active    int not null default 0,
  joins         int not null default 0,
  leaves        int not null default 0,
  billed        numeric not null default 0,       -- debits in the week
  credited      numeric not null default 0,       -- credits in the week (positive number)
  net_week      numeric not null default 0,       -- billed - credited
  net_to_date   numeric not null default 0,       -- running since inception
  created_at    timestamptz not null default now(),
  unique (policy_id, week_start)
);

grant select, insert, update, delete on policy_members, policy_movements, policy_transactions, policy_position_weekly to service_role;
revoke all on policy_members, policy_movements, policy_transactions, policy_position_weekly from anon;
notify pgrst, 'reload schema';
