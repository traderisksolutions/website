-- RFQ close-out (#4b): record the outcome of each line of insurance.
-- A "decision" is per line (rfq_request). When the client accepts a quote we BIND
-- it (won) and capture the commercial terms; the sibling quotes become lost. A line
-- can also be marked lost outright (client went direct / no decision / price).
-- Run in the Supabase SQL editor.

-- ── rfq_quotes: allow won/lost/declined + bind fields ─────────────────────────
alter table rfq_quotes drop constraint if exists rfq_quotes_status_check;
alter table rfq_quotes
  add column if not exists bound_premium  text,
  add column if not exists effective_date date,
  add column if not exists policy_number  text,
  add column if not exists outcome_reason text,
  add column if not exists bound_at       timestamptz;
alter table rfq_quotes
  add constraint rfq_quotes_status_check
  check (status in ('received','shortlisted','recommended','won','lost','declined'));

-- ── rfq_requests: per-line outcome status ─────────────────────────────────────
-- Existing values: open | dispatched | closed. Add quoted | won | lost and the
-- commercial snapshot of the winning quote for fast funnel/analytics reads.
alter table rfq_requests drop constraint if exists rfq_requests_status_check;
alter table rfq_requests
  add column if not exists won_dispatch_id uuid references rfq_dispatches(id) on delete set null,
  add column if not exists won_insurer     text,
  add column if not exists bound_premium   text,
  add column if not exists effective_date  date,
  add column if not exists policy_number   text,
  add column if not exists outcome_reason  text,
  add column if not exists decided_at      timestamptz;
alter table rfq_requests
  add constraint rfq_requests_status_check
  check (status in ('open','dispatched','quoted','won','lost','closed'));

create index if not exists rfq_quotes_status_idx    on rfq_quotes(status);
create index if not exists rfq_requests_status_idx  on rfq_requests(status);
