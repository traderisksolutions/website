-- ============================================================
-- TRS CRM — Full Schema
-- Paste into: https://supabase.com/dashboard/project/ctjapwjpwkvxubdmzbqg
-- SQL Editor → New Query → Paste → Run
-- ============================================================

-- ============================================================
-- COMPANIES
-- Institutions, SMEs, corporates
-- ============================================================
create table companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  domain      text,                                         -- e.g. acme.com.sg
  type        text check (type in ('institution', 'sme', 'corporate')),
  industry    text,
  address     text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- CONTACTS
-- 1 row = 1 person = 1 email
-- Individuals and company contacts all live here
-- ============================================================
create table contacts (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text unique not null,
  phone       text,
  source      text check (source in ('website', 'whatsapp', 'email', 'manual')),
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- COMPANY_CONTACTS
-- Junction: who belongs to which company, and in what role
-- is_primary = true marks the decision maker
-- ============================================================
create table company_contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  contact_id  uuid not null references contacts(id)  on delete cascade,
  role        text not null check (role in ('decision_maker', 'cc', 'stakeholder', 'billing')),
  is_primary  boolean default false,
  created_at  timestamptz default now(),
  unique (company_id, contact_id)
);

-- ============================================================
-- CUSTOMERS
-- Confirmed paying / serving customers
-- contact_id = decision maker (always set)
-- company_id = the org (null for individuals)
-- ============================================================
create table customers (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (type in ('individual', 'company')),
  contact_id       uuid not null references contacts(id),
  company_id       uuid references companies(id),
  account_manager  text,
  status           text default 'active' check (status in ('active', 'renewal_due', 'lapsed', 'cancelled')),
  customer_since   date,
  notes            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ============================================================
-- INBOUND LEADS
-- Every enquiry regardless of channel
-- contact_id nullable on arrival — matched to a contact later
-- ============================================================
create table inbound_leads (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid references contacts(id),
  company_id  uuid references companies(id),
  source      text not null check (source in ('manual', 'website_form', 'whatsapp_click', 'email')),
  message     text,
  page_url    text,
  session_id  text,                                         -- from analytics sessions table
  status      text default 'new' check (status in ('new', 'contacted', 'qualified', 'converted', 'dropped')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- DEALS
-- Only confirmed customers can have deals
-- ============================================================
create table deals (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references customers(id),
  title               text not null,
  product_type        text check (product_type in (
                        'motor', 'travel', 'property', 'cyber',
                        'foreign_worker', 'workmen', 'medical', 'other'
                      )),
  stage               text default 'new' check (stage in (
                        'new', 'discovery', 'proposal',
                        'negotiation', 'closed_won', 'closed_lost'
                      )),
  value_estimate      numeric,
  close_date_estimate date,
  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ============================================================
-- POLICIES
-- Issued policies linked to customer and deal
-- ============================================================
create table policies (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers(id),
  deal_id        uuid references deals(id),
  policy_number  text unique,
  insurer        text,
  product_type   text,
  sum_insured    numeric,
  premium        numeric,
  start_date     date,
  end_date       date,
  renewal_date   date,
  status         text default 'active' check (status in ('active', 'expired', 'cancelled')),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ============================================================
-- EMAIL THREADS
-- One row per Gmail thread
-- ============================================================
create table email_threads (
  id               uuid primary key default gen_random_uuid(),
  gmail_thread_id  text unique not null,
  customer_id      uuid references customers(id),
  deal_id          uuid references deals(id),
  subject          text,
  snippet          text,
  last_message_at  timestamptz,
  message_count    int default 0,
  status           text default 'active' check (status in ('active', 'resolved', 'archived')),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ============================================================
-- EMAIL MESSAGES
-- One row per individual email message
-- ============================================================
create table email_messages (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid not null references email_threads(id) on delete cascade,
  gmail_message_id  text unique not null,
  direction         text not null check (direction in ('inbound', 'outbound')),
  from_address      text,
  subject           text,
  body_text         text,
  body_html         text,
  sent_at           timestamptz,
  has_attachments   boolean default false,
  created_at        timestamptz default now()
);

-- ============================================================
-- EMAIL PARTICIPANTS
-- Every person on every email (to / cc / bcc)
-- contact_id auto-matched by email if known, else null
-- ============================================================
create table email_participants (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references email_threads(id)  on delete cascade,
  message_id  uuid not null references email_messages(id) on delete cascade,
  email       text not null,
  name        text,
  role        text not null check (role in ('from', 'to', 'cc', 'bcc')),
  contact_id  uuid references contacts(id),               -- null if not yet matched
  created_at  timestamptz default now()
);

-- ============================================================
-- WHATSAPP MESSAGES
-- Inbound and outbound WhatsApp messages
-- contact_id nullable until matched to a known contact
-- ============================================================
create table whatsapp_messages (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid references contacts(id),
  direction    text not null check (direction in ('inbound', 'outbound')),
  phone_number text not null,
  message      text,
  media_url    text,
  sent_at      timestamptz,
  status       text default 'sent' check (status in ('sent', 'delivered', 'read')),
  created_at   timestamptz default now()
);

-- ============================================================
-- INTERACTIONS
-- Manual log: calls, meetings, notes, any touchpoint
-- ============================================================
create table interactions (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid references customers(id),
  contact_id   uuid references contacts(id),
  deal_id      uuid references deals(id),
  type         text not null check (type in ('call', 'meeting', 'note', 'email', 'whatsapp')),
  summary      text,
  created_by   text,
  created_at   timestamptz default now()
);


-- ============================================================
-- INDEXES
-- ============================================================

create index idx_contacts_email          on contacts           (email);

create index idx_cc_company              on company_contacts   (company_id);
create index idx_cc_contact              on company_contacts   (contact_id);
create index idx_cc_primary              on company_contacts   (company_id, is_primary);

create index idx_customers_contact       on customers          (contact_id);
create index idx_customers_company       on customers          (company_id);
create index idx_customers_status        on customers          (status);

create index idx_leads_contact           on inbound_leads      (contact_id);
create index idx_leads_status            on inbound_leads      (status);
create index idx_leads_created           on inbound_leads      (created_at desc);

create index idx_deals_customer          on deals              (customer_id);
create index idx_deals_stage             on deals              (stage);

create index idx_policies_customer       on policies           (customer_id);
create index idx_policies_renewal        on policies           (renewal_date);

create index idx_threads_customer        on email_threads      (customer_id);
create index idx_threads_deal            on email_threads      (deal_id);
create index idx_threads_last_message    on email_threads      (last_message_at desc);

create index idx_messages_thread         on email_messages     (thread_id);
create index idx_messages_sent           on email_messages     (sent_at desc);

create index idx_participants_email      on email_participants (email);
create index idx_participants_contact    on email_participants (contact_id);
create index idx_participants_thread     on email_participants (thread_id);

create index idx_wa_contact              on whatsapp_messages  (contact_id);
create index idx_wa_phone                on whatsapp_messages  (phone_number);
create index idx_wa_sent                 on whatsapp_messages  (sent_at desc);

create index idx_interactions_customer   on interactions       (customer_id);
create index idx_interactions_deal       on interactions       (deal_id);
create index idx_interactions_created    on interactions       (created_at desc);


-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_companies_updated    before update on companies     for each row execute function update_updated_at();
create trigger trg_contacts_updated     before update on contacts      for each row execute function update_updated_at();
create trigger trg_customers_updated    before update on customers     for each row execute function update_updated_at();
create trigger trg_leads_updated        before update on inbound_leads for each row execute function update_updated_at();
create trigger trg_deals_updated        before update on deals         for each row execute function update_updated_at();
create trigger trg_policies_updated     before update on policies      for each row execute function update_updated_at();
create trigger trg_threads_updated      before update on email_threads for each row execute function update_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Locks every table — only your authenticated staff can read/write
-- Website visitors (anon) can only INSERT leads and WhatsApp messages
-- ============================================================

alter table companies          enable row level security;
alter table contacts           enable row level security;
alter table company_contacts   enable row level security;
alter table customers          enable row level security;
alter table inbound_leads      enable row level security;
alter table deals              enable row level security;
alter table policies           enable row level security;
alter table email_threads      enable row level security;
alter table email_messages     enable row level security;
alter table email_participants enable row level security;
alter table whatsapp_messages  enable row level security;
alter table interactions       enable row level security;

-- Staff (authenticated) — full access to everything
create policy "staff_companies"          on companies          for all using (auth.role() = 'authenticated');
create policy "staff_contacts"           on contacts           for all using (auth.role() = 'authenticated');
create policy "staff_company_contacts"   on company_contacts   for all using (auth.role() = 'authenticated');
create policy "staff_customers"          on customers          for all using (auth.role() = 'authenticated');
create policy "staff_leads"              on inbound_leads      for all using (auth.role() = 'authenticated');
create policy "staff_deals"              on deals              for all using (auth.role() = 'authenticated');
create policy "staff_policies"           on policies           for all using (auth.role() = 'authenticated');
create policy "staff_threads"            on email_threads      for all using (auth.role() = 'authenticated');
create policy "staff_messages"           on email_messages     for all using (auth.role() = 'authenticated');
create policy "staff_participants"       on email_participants for all using (auth.role() = 'authenticated');
create policy "staff_wa"                 on whatsapp_messages  for all using (auth.role() = 'authenticated');
create policy "staff_interactions"       on interactions       for all using (auth.role() = 'authenticated');

-- Anonymous (website visitors) — insert only for lead capture
create policy "anon_insert_leads"        on inbound_leads      for insert with check (true);
create policy "anon_insert_wa"           on whatsapp_messages  for insert with check (true);
