-- Sales Loop v2, Phase 6d — richer optional rules VM for Group Benefits, mirroring
-- pm_computation_rules' exact shape and independent-lifecycle precedent. 1:1 with
-- gb_rate_tables; a row here is ONLY ever consulted by gb-quote.ts's computeQuote() when
-- status='approved' and rules is non-empty — every table without an approved row keeps running
-- the existing gb_rate_tables.rules (AppliedRules) path completely unchanged. This is additive
-- and optional: existing calculators, quotes, and their AppliedRules stay exactly as they are.

create table if not exists gb_computation_rules (
  id             uuid primary key default gen_random_uuid(),
  rate_table_id  uuid not null unique references gb_rate_tables(id) on delete cascade,
  version        int not null default 1,
  source         text check (source in ('embedded_table','formula_shell','hybrid')),
  status         text not null default 'draft' check (status in ('draft','in_review','approved','archived')),
  rules          jsonb not null default '[]'::jsonb,   -- RuleStep[] — same vocabulary as pm_computation_rules.rules
  -- The Phase 6d approval gate: the diff between this rule set's computed total and the current
  -- AppliedRules-computed total for the same test census, captured at the moment of approval so
  -- there's a durable record of what was reviewed, not just a point-in-time UI check.
  verification   jsonb,
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists gb_computation_rules_table_idx on gb_computation_rules (rate_table_id);
