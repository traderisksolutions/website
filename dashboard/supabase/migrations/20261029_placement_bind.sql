-- Comparison and bind (29 Oct 2026, phase 4 of the RFQ flow).
--   placement_shares: every comparison sent to the client, kept as sent (the quotes it carried,
--   the subject and body, who sent it from which mailbox). Partial comparisons are normal: a
--   share lists only the quotes that were in it.
--   placement_lines: the client's pick and the confirmation with the insurer, so a line reads
--   client picked → confirmation sent → insurer confirmed → debit note → done.
-- Apply after 20261028_insurer_products.sql. Safe to re-run.

create table if not exists placement_shares (
  id            uuid primary key default gen_random_uuid(),
  placement_id  uuid not null references placements(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  ai_draft_id   uuid,
  quote_ids     uuid[] not null default '{}',
  subject       text,
  body          text,
  status        text not null default 'drafted' check (status in ('drafted','sent','discarded')),
  sent_at       timestamptz,
  sent_by       text,
  sent_from     text,
  rfc822_message_id text,
  created_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists placement_shares_placement_idx on placement_shares(placement_id, created_at desc);
create unique index if not exists placement_shares_draft_idx on placement_shares(ai_draft_id) where ai_draft_id is not null;

alter table placement_lines add column if not exists picked_quote_id        uuid references placement_quotes(id) on delete set null;
alter table placement_lines add column if not exists client_confirmed_at    timestamptz;
alter table placement_lines add column if not exists confirm_draft_id       uuid;
alter table placement_lines add column if not exists confirm_sent_at        timestamptz;
alter table placement_lines add column if not exists insurer_confirmed_at   timestamptz;

grant select, insert, update, delete on placement_shares to service_role;
revoke all on placement_shares from anon;
notify pgrst, 'reload schema';
