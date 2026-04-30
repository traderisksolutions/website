-- ============================================================
-- INBOUND LEADS — Trade Risk Solutions
-- Updated schema with all fields captured from website forms
--
-- Sources:
--   website_form   → contact popover email form
--   whatsapp_click → contact popover WA form
--   claims_form    → /claims page submission
--   manual         → staff-entered
--
-- Run the migration block below in Supabase SQL Editor
-- if the table already exists. Otherwise run CREATE TABLE.
-- ============================================================


-- ============================================================
-- FULL TABLE DEFINITION (reference / fresh installs)
-- ============================================================
create table if not exists inbound_leads (
  id           uuid        primary key default gen_random_uuid(),

  -- CRM links (populated after manual review / deduplication)
  contact_id   uuid        references contacts(id),
  company_id   uuid        references companies(id),

  -- Capture metadata
  source       text        not null check (source in (
                 'manual', 'website_form', 'whatsapp_click', 'claims_form', 'email'
               )),
  page_url     text,
  session_id   text,

  -- Person
  first_name   text,
  last_name    text,
  email        text,
  phone        text,

  -- Organisation
  company      text,

  -- Routing
  department   text        check (department in ('Sales', 'Customer Support', 'Claims')),
  contact_type text        check (contact_type in ('Individual', 'Business', 'Claim')),

  -- Enquiry content
  topic        text,
  details      text,
  message      text,       -- raw WhatsApp message string (whatsapp_click only)

  -- Workflow
  status       text        default 'new' check (status in (
                 'new', 'contacted', 'qualified', 'converted', 'dropped'
               )),

  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);


-- ============================================================
-- MIGRATION — add new columns if table already exists
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS checks)
-- ============================================================
alter table inbound_leads add column if not exists first_name   text;
alter table inbound_leads add column if not exists last_name    text;
alter table inbound_leads add column if not exists email        text;
alter table inbound_leads add column if not exists phone        text;
alter table inbound_leads add column if not exists company      text;
alter table inbound_leads add column if not exists department   text;
alter table inbound_leads add column if not exists contact_type text;
alter table inbound_leads add column if not exists topic        text;
alter table inbound_leads add column if not exists details      text;

-- Update source check to include claims_form
alter table inbound_leads
  drop constraint if exists inbound_leads_source_check;
alter table inbound_leads
  add constraint inbound_leads_source_check
  check (source in ('manual', 'website_form', 'whatsapp_click', 'claims_form', 'email'));

-- Update contact_type check to include Claim
alter table inbound_leads
  drop constraint if exists inbound_leads_contact_type_check;
alter table inbound_leads
  add constraint inbound_leads_contact_type_check
  check (contact_type in ('Individual', 'Business', 'Claim'));

-- Update department check
alter table inbound_leads
  drop constraint if exists inbound_leads_department_check;
alter table inbound_leads
  add constraint inbound_leads_department_check
  check (department in ('Sales', 'Customer Support', 'Claims'));


-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_leads_contact    on inbound_leads (contact_id);
create index if not exists idx_leads_status     on inbound_leads (status);
create index if not exists idx_leads_department on inbound_leads (department);
create index if not exists idx_leads_source     on inbound_leads (source);
create index if not exists idx_leads_created    on inbound_leads (created_at desc);
create index if not exists idx_leads_email      on inbound_leads (email);


-- ============================================================
-- RLS POLICIES
-- ============================================================
alter table inbound_leads enable row level security;

-- Staff: full access
create policy "staff_leads"
  on inbound_leads for all
  using (auth.role() = 'authenticated');

-- Anonymous: insert only (website visitors submitting forms)
create policy "anon_insert_leads"
  on inbound_leads for insert
  with check (true);

-- Dashboard read access: use service role key in .env.local, or
-- temporarily allow anon reads during development:
-- create policy "anon_read_leads_dev"
--   on inbound_leads for select
--   using (true);


-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_updated on inbound_leads;
create trigger trg_leads_updated
  before update on inbound_leads
  for each row execute function update_updated_at();


-- ============================================================
-- REALTIME (optional — for live dashboard feed)
-- ============================================================
-- alter publication supabase_realtime add table inbound_leads;
