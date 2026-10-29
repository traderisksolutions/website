-- Member movements, end to end and analysable (30 Oct 2026).
-- Each movement carries when every step happened, the pro-rata TRS expected and the rate it used,
-- so billing lag, variance and joiner/leaver patterns can be measured per client and insurer.
begin;

alter table policy_movements add column if not exists last_day         date;          -- leaver: last day of service
alter table policy_movements add column if not exists employment_date  date;
alter table policy_movements add column if not exists category         text;
alter table policy_movements add column if not exists plan_code        text;
alter table policy_movements add column if not exists annual_rate      numeric(12,2); -- per member, before GST
alter table policy_movements add column if not exists rate_source      text check (rate_source in ('insurer_note','rate_table','premium_per_head'));
alter table policy_movements add column if not exists estimate_amount  numeric(12,2); -- signed, incl. GST
alter table policy_movements add column if not exists estimate_basis   text;
alter table policy_movements add column if not exists noted_at         timestamptz;   -- insurer's DN/CN read
alter table policy_movements add column if not exists billed_at        timestamptz;   -- TRS DN/CN issued
alter table policy_movements add column if not exists settled_at       timestamptz;   -- paid / refunded
alter table policy_movements add column if not exists chase_count      int not null default 0;
alter table policy_movements add column if not exists last_chase_at    timestamptz;
alter table policy_movements add column if not exists next_chase_at    timestamptz;
alter table policy_movements drop constraint if exists policy_movements_status_check;
alter table policy_movements add constraint policy_movements_status_check
  check (status in ('reported','sent','noted','billed','settled','cancelled'));
create index if not exists policy_movements_chase_idx on policy_movements (next_chase_at) where status = 'sent';

alter table policy_transactions add column if not exists estimate_amount numeric(12,2);
alter table policy_transactions add column if not exists variance_amount numeric(12,2);

alter table placement_log drop constraint if exists placement_log_kind_check;
alter table placement_log add constraint placement_log_kind_check
  check (kind in ('note','decision','ask','reply','change','chase','quote','sent','declined','info','opened','closed','done','billing','movement'));

-- One row per movement for analytics: who, what, when each step happened, money expected and billed.
create or replace view movement_facts as
select m.id as movement_id, m.company_id, c.company_name, m.policy_id, p.policy_number, p.insurer, p.product_line, p.is_eb,
       m.kind, m.relationship, m.category, m.plan_code, m.pax,
       date_part('year', age(coalesce(m.effective_on, m.created_at::date), mem.dob))::int as age_at_effective,
       mem.gender, m.employment_date, m.effective_on, m.last_day,
       m.created_at as reported_at, m.sent_at, m.noted_at, m.billed_at, m.settled_at,
       (m.sent_at::date - m.created_at::date) as days_to_send,
       (m.noted_at::date - m.sent_at::date) as days_insurer,
       (m.billed_at::date - m.noted_at::date) as days_to_bill,
       m.chase_count, m.annual_rate, m.rate_source, m.estimate_amount,
       t.amount as billed_amount, t.note_no as insurer_note_no, t.kind as note_kind, t.variance_amount, m.status
  from policy_movements m
  left join policies p on p.id = m.policy_id
  left join companies c on c.id = m.company_id
  left join policy_members mem on mem.id = m.member_id
  left join policy_transactions t on t.id = m.transaction_id;

notify pgrst, 'reload schema';
commit;
