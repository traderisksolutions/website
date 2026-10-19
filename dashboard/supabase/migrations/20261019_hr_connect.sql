-- HR Connect (19 Oct 2026): a client's HR provides the employee list for a group benefits
-- quotation through a tokenised page, by uploading a CSV/XLSX, pasting a Talenox API token, or
-- giving a Workday integration user. The broker sends the link from the dashboard
-- (operations@trade-risksol.com); the list lands as a submission the quote engine reads.
--
-- Tokens are random, stored hashed, expire, and close on submit. Nothing HR types for Talenox
-- or Workday is stored: the credential is used for one fetch and discarded.

create extension if not exists pgcrypto;

create table if not exists hr_links (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,                  -- 'GB-2026-0142'
  company_id       uuid references companies(id) on delete set null,
  company_name     text not null,
  quotation_id     uuid references gb_quotations(id) on delete set null,
  effective_date   date,
  recipient_name   text not null,
  recipient_email  text not null,
  cc_email         text,
  requested_by     text,                                   -- the client contact who asked for the quote
  message          text not null default '',               -- the editable opening paragraphs
  token_hash       text not null unique,                   -- sha256 of the URL token
  status           text not null default 'sent' check (status in ('sent','opened','submitted','expired','closed')),
  sent_by          text,
  sent_at          timestamptz not null default now(),
  expires_at       timestamptz not null,
  opened_at        timestamptz,
  submitted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists hr_links_company_idx on hr_links (company_id, created_at desc);
create index if not exists hr_links_status_idx on hr_links (status, expires_at);

create table if not exists hr_link_events (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references hr_links(id) on delete cascade,
  kind       text not null check (kind in ('sent','resent','opened','uploaded','connected','saved','submitted','expired','closed','error')),
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists hr_link_events_link_idx on hr_link_events (link_id, created_at);

create table if not exists hr_submissions (
  id                 uuid primary key default gen_random_uuid(),
  link_id            uuid not null references hr_links(id) on delete cascade,
  company_id         uuid references companies(id) on delete set null,
  source             text not null check (source in ('csv','talenox','workday','manual')),
  source_meta        jsonb not null default '{}',          -- filename, column map, tenant host; never a credential
  employees          jsonb not null default '[]',          -- HrEmployee[] (src/lib/hr/types.ts)
  dependants         jsonb not null default '[]',          -- HrDependant[]
  employee_count     int  not null default 0,
  dependant_count    int  not null default 0,
  status             text not null default 'draft' check (status in ('draft','submitted')),
  submitted_by_name  text,
  submitted_by_email text,
  consent_text       text,
  consent_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists hr_submissions_link_idx on hr_submissions (link_id, updated_at desc);
create index if not exists hr_submissions_company_idx on hr_submissions (company_id, created_at desc);

-- Reference numbers: GB-<year>-<4 digits>, one sequence per year.
create sequence if not exists hr_link_reference_seq;
