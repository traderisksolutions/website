-- RFQ Pipeline — Phase B of the RFQ engagement agent.
-- When an inbound email is detected as a Request for Quotation, the detector opens
-- ONE Nexus case for the client and stores each requested line of insurance here.
-- Employees then pick insurers per line and dispatch personalized RFQ emails.
-- Run this in the Supabase SQL editor.

-- ── 1. Extracted request lines (one per product line on the inbound RFQ) ───────

create table if not exists rfq_requests (
  id                uuid default gen_random_uuid() primary key,
  case_id           uuid not null references cases(id) on delete cascade,
  client_thread_id  uuid,                          -- email_threads.id the RFQ arrived on
  client_message_id uuid,                          -- email_messages.id (dedupe key)
  product_line      text not null,                 -- slug from src/lib/product-lines.ts
  insured_name      text,                          -- company / person seeking cover
  summary           text,                          -- one-line description of this line
  key_details       text,                          -- extracted specifics (sums insured, etc.)
  status            text not null default 'open',  -- open | dispatched | closed
  created_at        timestamptz default now()
);

create index if not exists rfq_requests_case_id_idx    on rfq_requests(case_id);
create index if not exists rfq_requests_message_idx     on rfq_requests(client_message_id);

-- ── 2. Dispatches (which insurer each request line was sent to) ────────────────
-- Insurer identity is snapshotted so history survives directory edits/deletes.
-- thread_id is filled in Phase C for reply-matching.

create table if not exists rfq_dispatches (
  id                 uuid default gen_random_uuid() primary key,
  rfq_request_id     uuid not null references rfq_requests(id) on delete cascade,
  insurer_contact_id uuid references insurer_contacts(id) on delete set null,
  insurer_name       text,                         -- snapshot
  product_line       text,                         -- snapshot
  to_email           text not null,                -- snapshot
  ai_draft_id        uuid,                          -- ai_drafts.id
  thread_id          uuid,                          -- email_threads.id (Phase C)
  status             text not null default 'sent', -- drafted | sent | replied
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists rfq_dispatches_request_idx on rfq_dispatches(rfq_request_id);
create index if not exists rfq_dispatches_thread_idx  on rfq_dispatches(thread_id);
