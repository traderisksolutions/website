-- Placement: a client asks for one or more policies; each line is sent to several insurers for a
-- price; every change of spec opens a new round and every insurer is asked again; replies are
-- read into quotes; the company keeps a log of where the work stands (27 Oct 2026).
--
-- Replaces the retired rfq_* tables (July 2026, keyed on Nexus cases). Those stay untouched.
-- Apply with ~/trs-dn-migration/apply-sql.sh. Server reads and writes with the service key only.

create extension if not exists pgcrypto;

create table if not exists placements (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  title             text not null,
  client_thread_id  uuid,                        -- email_threads.id the request came in on
  client_contact_id uuid,                        -- contacts.id of the person asking
  status            text not null default 'open'
                    check (status in ('open','presented','bound','closed')),
  inception_date    date,
  notes             text,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists placements_company_idx on placements(company_id);
create index if not exists placements_client_thread_idx on placements(client_thread_id) where client_thread_id is not null;

create table if not exists placement_lines (
  id                uuid primary key default gen_random_uuid(),
  placement_id      uuid not null references placements(id) on delete cascade,
  product_line      text not null,               -- slug from src/lib/product-lines.ts
  label             text,
  spec              jsonb not null default '{}'::jsonb,   -- current spec (mirror of the current round)
  status            text not null default 'open'
                    check (status in ('open','quoting','quoted','presented','bound','declined','closed')),
  current_round_id  uuid,
  next_step         text,
  sort              int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists placement_lines_placement_idx on placement_lines(placement_id);

create table if not exists placement_rounds (
  id                uuid primary key default gen_random_uuid(),
  placement_id      uuid not null references placements(id) on delete cascade,
  line_id           uuid not null references placement_lines(id) on delete cascade,
  round_no          int not null,
  spec              jsonb not null default '{}'::jsonb,   -- snapshot asked of the insurers this round
  change_summary    text,                         -- what changed from the previous round, in words
  reason            text not null default 'initial'
                    check (reason in ('initial','client_change','insurer_query','expiry','broker')),
  source_message_id uuid,                         -- the client message that caused it, if any
  opened_by         text,
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz,
  unique (line_id, round_no)
);
create index if not exists placement_rounds_line_idx on placement_rounds(line_id);

create table if not exists placement_dispatches (
  id                  uuid primary key default gen_random_uuid(),
  placement_id        uuid not null references placements(id) on delete cascade,
  line_id             uuid not null references placement_lines(id) on delete cascade,
  round_id            uuid not null references placement_rounds(id) on delete cascade,
  company_id          uuid not null,              -- the client, denormalised for the log and lookups
  insurer_company_id  uuid,                       -- companies.id (kind insurer)
  insurer_name        text not null,
  insurer_contact_id  uuid,                       -- contacts.id
  to_email            text not null,
  ai_draft_id         uuid,                       -- ai_drafts.id; several dispatches may share one draft
  thread_id           uuid,                       -- email_threads.id once known
  gmail_thread_id     text,
  status              text not null default 'drafted'
                      check (status in ('drafted','sent','acknowledged','info_requested','quoted','declined','expired','withdrawn')),
  sent_at             timestamptz,
  last_outbound_at    timestamptz,
  last_inbound_at     timestamptz,
  next_chase_at       timestamptz,
  chase_count         int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists placement_dispatches_round_idx on placement_dispatches(round_id);
create index if not exists placement_dispatches_thread_idx on placement_dispatches(thread_id) where thread_id is not null;
create index if not exists placement_dispatches_gmail_idx on placement_dispatches(gmail_thread_id) where gmail_thread_id is not null;
create index if not exists placement_dispatches_chase_idx on placement_dispatches(next_chase_at) where next_chase_at is not null;
create index if not exists placement_dispatches_draft_idx on placement_dispatches(ai_draft_id) where ai_draft_id is not null;

create table if not exists placement_quotes (
  id                uuid primary key default gen_random_uuid(),
  placement_id      uuid not null references placements(id) on delete cascade,
  line_id           uuid not null references placement_lines(id) on delete cascade,
  round_id          uuid not null references placement_rounds(id) on delete cascade,
  dispatch_id       uuid not null references placement_dispatches(id) on delete cascade,
  insurer_name      text not null,
  -- Verbatim figures with per-field evidence, plus normalised amounts for comparison.
  premium_text      text,
  premium_amount    numeric,
  currency          text,
  limit_text        text,
  limit_amount      numeric,
  excess_text       text,
  validity_text     text,
  valid_until       date,
  key_terms         text[] not null default '{}',
  exclusions        text[] not null default '{}',
  subjectivities    text[] not null default '{}',
  summary           text,
  evidence          jsonb not null default '{}'::jsonb,
  source_message_id uuid,
  thread_id         uuid,
  status            text not null default 'received'
                    check (status in ('received','superseded','shortlisted','recommended','selected','not_chosen','expired')),
  needs_review      boolean not null default false,
  extracted_by      text,
  created_at        timestamptz not null default now()
);
create index if not exists placement_quotes_dispatch_idx on placement_quotes(dispatch_id);
create index if not exists placement_quotes_line_idx on placement_quotes(line_id);

-- The company memory: one entry per thing that happened or was decided, in order.
create table if not exists placement_log (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  placement_id  uuid references placements(id) on delete cascade,
  line_id       uuid,
  round_id      uuid,
  dispatch_id   uuid,
  kind          text not null
                check (kind in ('note','decision','ask','reply','change','chase','quote','sent','declined','info','opened','closed')),
  actor         text not null default 'agent',  -- staff email, 'agent' or 'system'
  text          text not null,
  thread_id     uuid,
  message_id    uuid,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists placement_log_company_idx on placement_log(company_id, created_at desc);
create index if not exists placement_log_placement_idx on placement_log(placement_id, created_at desc);

grant select, insert, update, delete on placements, placement_lines, placement_rounds, placement_dispatches, placement_quotes, placement_log to service_role;
revoke all on placements, placement_lines, placement_rounds, placement_dispatches, placement_quotes, placement_log from anon;
notify pgrst, 'reload schema';
