-- Structured, persisted insurer quotes (Workstream 1).
-- Auto-captured when an insurer replies to an RFQ; read from the insurer email
-- body AND the linked attachment text. Figures are stored verbatim (text) with
-- per-field evidence excerpts so employees can verify the source and the model
-- cannot silently hallucinate a price. Run in the Supabase SQL editor.

create table if not exists rfq_quotes (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid references cases(id) on delete cascade,
  rfq_request_id    uuid references rfq_requests(id) on delete cascade,
  dispatch_id       uuid references rfq_dispatches(id) on delete cascade,
  insurer_name      text,
  product_line      text,                         -- slug snapshot

  -- Figures kept as TEXT, word-for-word (with currency), never normalised.
  premium           text,
  excess            text,
  limit_indemnity   text,
  validity          text,
  key_terms         text[] default '{}',
  exclusions        text[] default '{}',
  summary           text,

  -- Anti-hallucination: per-field verbatim source excerpt + which document.
  --   { premium: { excerpt, source }, excess: {...}, limit_indemnity: {...}, validity: {...} }
  evidence          jsonb  default '{}'::jsonb,
  primary_source    text,                         -- 'email body' | 'attachment: <filename>'

  status            text not null default 'received'
                    check (status in ('received','shortlisted','recommended')),
  source_message_id uuid,
  extracted_by      text,
  raw               jsonb,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),

  unique (dispatch_id)                            -- one current quote per insurer send
);

create index if not exists rfq_quotes_case_idx    on rfq_quotes(case_id);
create index if not exists rfq_quotes_request_idx  on rfq_quotes(rfq_request_id);
create index if not exists rfq_quotes_dispatch_idx on rfq_quotes(dispatch_id);
