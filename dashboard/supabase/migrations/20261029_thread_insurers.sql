-- Insurer threads (29 Oct 2026): every email thread an insurer takes part in, filed under that
-- insurer, with the policy it is about — matched by rule or estimated by the agent, confirmed by
-- a broker. Additive only. Apply with ~/trs-dn-migration/apply-sql.sh.
create table if not exists thread_insurers (
  id                  uuid primary key default gen_random_uuid(),
  thread_id           uuid not null,
  insurer_company_id  uuid not null references companies(id) on delete cascade,
  client_company_id   uuid references companies(id) on delete set null,
  policy_id           uuid references policies(id) on delete set null,
  placement_line_id   uuid,
  via                 text not null check (via in ('sender_domain', 'subject', 'broker')),
  policy_status       text not null default 'none' check (policy_status in ('none', 'suggested', 'confirmed', 'not_a_policy')),
  policy_how          text,            -- 'policy no. in subject', 'only policy with this insurer', 'agent', 'broker'
  confidence          numeric,
  reason              text,
  last_message_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (thread_id, insurer_company_id)
);
create index if not exists thread_insurers_insurer_idx on thread_insurers(insurer_company_id, last_message_at desc);
create index if not exists thread_insurers_policy_idx on thread_insurers(policy_id);
grant select, insert, update, delete on thread_insurers to service_role;
revoke all on thread_insurers from anon;
notify pgrst, 'reload schema';
