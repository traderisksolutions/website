-- End-to-end RFQ audit trail + simplified outcome.
--
-- rfq_events = one row per touchpoint across the whole RFQ lifecycle
-- (requested → dispatched → replied → quoted → recommended → selected/not_chosen),
-- each linked to the real ids (case, request line, dispatch, quote) and the actor
-- (user email, or 'system' for background steps like auto quote-capture).
--
-- Outcome is simplified to Selected / Not chosen (the old bind/won/lost columns
-- stay for back-compat but are no longer written).
-- Run in the Supabase SQL editor.

create table if not exists rfq_events (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  case_id        uuid,
  rfq_request_id uuid,
  dispatch_id    uuid,
  quote_id       uuid,
  event_type     text not null,          -- requested|dispatched|replied|quoted|recommended|selected|not_chosen|reopened
  insurer_name   text,
  actor          text,                    -- user email, or 'system'
  summary        text,
  detail         jsonb default '{}'::jsonb
);

create index if not exists rfq_events_case_idx    on rfq_events(case_id);
create index if not exists rfq_events_request_idx on rfq_events(rfq_request_id);
create index if not exists rfq_events_type_idx    on rfq_events(event_type);
create index if not exists rfq_events_created_idx on rfq_events(created_at desc);

-- Simplified outcome statuses (keep the older ones so existing rows stay valid).
alter table rfq_quotes drop constraint if exists rfq_quotes_status_check;
alter table rfq_quotes add constraint rfq_quotes_status_check
  check (status in ('received','shortlisted','recommended','selected','not_chosen','won','lost','declined'));

alter table rfq_requests drop constraint if exists rfq_requests_status_check;
alter table rfq_requests add constraint rfq_requests_status_check
  check (status in ('open','dispatched','quoted','recommended','selected','not_chosen','won','lost','closed'));
