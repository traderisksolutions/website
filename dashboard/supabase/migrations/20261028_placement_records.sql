-- Placement records you can trust (28 Oct 2026, phase 1 of the RFQ flow).
--   · every placement gets a reference (Q-0142) that rides in the subject of every email about it
--   · a dispatch remembers who sent it, from which mailbox, and the Message-ID header, so a reply
--     is matched whichever mailbox it lands in
--   · tiers: anything the client wants priced side by side (1M, 2M, "what does $1,300/pax buy");
--     every tier price an insurer gives is its own quote row, never overwritten
--   · replies the agent cannot place wait in a queue for a broker
--   · a line is done when its debit note is issued and filed in Drive
-- Apply with ~/trs-dn-migration/apply-sql.sh, after 20261027_company_spine.sql.

-- ── Reference ───────────────────────────────────────────────────────────────────────────────
create sequence if not exists placement_ref_seq;
alter table placements add column if not exists ref text;
with numbered as (select id, row_number() over (order by created_at, id) as n from placements where ref is null)
update placements p set ref = 'Q-' || lpad(numbered.n::text, 4, '0') from numbered where numbered.id = p.id;
-- Continue after the highest reference in use, so a re-run or a deleted row never reissues a number.
select setval('placement_ref_seq', greatest(n, 1), n > 0)
  from (select coalesce(max(substring(ref from '^Q-(\d+)$')::int), 0) as n from placements) c;
alter table placements alter column ref set default 'Q-' || lpad(nextval('placement_ref_seq')::text, 4, '0');
alter table placements alter column ref set not null;
create unique index if not exists placements_ref_idx on placements(ref);

-- ── Who sent each request, and how to recognise the reply ───────────────────────────────────
alter table placement_dispatches add column if not exists rfc822_message_id text;   -- Message-ID header of the request
alter table placement_dispatches add column if not exists sent_from         text;   -- mailbox it went out from
alter table placement_dispatches add column if not exists sent_by           text;   -- staff email of whoever pressed Send
alter table placement_dispatches add column if not exists sent_subject      text;
create index if not exists placement_dispatches_rfc822_idx on placement_dispatches(rfc822_message_id) where rfc822_message_id is not null;

-- ── Tiers ───────────────────────────────────────────────────────────────────────────────────
create table if not exists placement_tiers (
  id                uuid primary key default gen_random_uuid(),
  placement_id      uuid not null references placements(id) on delete cascade,
  line_id           uuid not null references placement_lines(id) on delete cascade,
  label             text not null,                -- "1M", "S$1,300 per head", "Plan B + outpatient"
  spec              jsonb not null default '{}'::jsonb,   -- what differs from the line's spec, same keys
  target_premium    text,                         -- a budget the client wants to see what it buys
  status            text not null default 'proposed'
                    check (status in ('proposed','asked','offered','dropped')),
  source            text not null default 'broker'
                    check (source in ('client','broker','insurer')),
  source_message_id uuid,
  created_by        text,
  asked_at          timestamptz,
  sort              int not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists placement_tiers_line_idx on placement_tiers(line_id);
create unique index if not exists placement_tiers_label_idx on placement_tiers(line_id, lower(label));

alter table placement_quotes add column if not exists tier_id                 uuid references placement_tiers(id) on delete set null;
alter table placement_quotes add column if not exists tier_label              text;     -- as the insurer wrote it
alter table placement_quotes add column if not exists premium_per_head_text   text;
alter table placement_quotes add column if not exists premium_per_head_amount numeric;
create index if not exists placement_quotes_tier_idx on placement_quotes(tier_id) where tier_id is not null;

-- ── Replies waiting for a broker ────────────────────────────────────────────────────────────
create table if not exists placement_unmatched (
  id                     uuid primary key default gen_random_uuid(),
  message_id             uuid not null unique,     -- email_messages.id
  thread_id              uuid,
  from_address           text,                     -- the insurer, or the original sender of a forward
  forwarded_by           text,                     -- the TRS address that forwarded it, if it was
  subject                text,
  reason                 text not null,
  candidate_dispatch_ids uuid[] not null default '{}',
  company_id             uuid,                     -- the likely client, for the company log
  status                 text not null default 'open' check (status in ('open','assigned','ignored')),
  assigned_dispatch_ids  uuid[] not null default '{}',
  resolved_by            text,
  resolved_at            timestamptz,
  created_at             timestamptz not null default now()
);
create index if not exists placement_unmatched_open_idx on placement_unmatched(created_at desc) where status = 'open';

-- ── Done = debit note issued and filed in Drive ─────────────────────────────────────────────
alter table placement_lines add column if not exists done_at       timestamptz;
alter table placement_lines add column if not exists debit_note_id uuid;
alter table placement_lines drop constraint if exists placement_lines_status_check;
alter table placement_lines add constraint placement_lines_status_check
  check (status in ('open','quoting','quoted','presented','bound','declined','closed','done','dropped','lost'));
alter table placement_log drop constraint if exists placement_log_kind_check;
alter table placement_log add constraint placement_log_kind_check
  check (kind in ('note','decision','ask','reply','change','chase','quote','sent','declined','info','opened','closed','done'));

grant select, insert, update, delete on placement_tiers, placement_unmatched to service_role;
grant usage, select on sequence placement_ref_seq to service_role;
revoke all on placement_tiers, placement_unmatched from anon;
notify pgrst, 'reload schema';
