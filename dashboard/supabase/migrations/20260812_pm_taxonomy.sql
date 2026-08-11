-- Pricing Matrix — DB-backed benefit-category taxonomy, replacing the hardcoded
-- PM_CANONICAL_CATEGORIES list (src/lib/pm-canonical-categories.ts) with an editable,
-- approvable one.
--
-- pm-canonical-categories.ts was a deliberate closed set (see its own header comment) so
-- cross-insurer alignment was consistent by construction — that stays true here, it just moves
-- from "edit a TS file, ship a deploy" to "approve a card in the taxonomy manager UI".
--
-- pm_taxonomy_categories is seeded 1:1 from the old list (same strings, same order) so every
-- coverage/term already classified with e.g. canonical_category: "Dental" still matches a real
-- row by name — no backfill is required for this migration to be safe to run.
--
-- pm_taxonomy_synonyms is the pending-approval queue: when extraction meets a coverage/term
-- wording that doesn't exactly match an active category name, it inserts a 'pending' row here
-- instead of guessing. This is what the taxonomy manager's "New terminology" queue and each
-- calculator's onboarding-review "New terminology" card both read from.
--
-- canonical_category_id itself is NOT a new column on pm_rate_tables/pm_benefit_terms — those
-- stay jsonb (coverages[]/terms[] elements), and extraction + taxonomy-approval write a sibling
-- `canonical_category_id` key alongside the existing `canonical_category` label directly into
-- the jsonb, same as canonical_category itself was added without a migration.
--
-- Run in the Supabase SQL editor (after 20260806_pm_reconciliation_issues.sql).

create table if not exists pm_taxonomy_categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  description   text,
  sort_order    int not null default 0,
  is_protected  bool not null default false,  -- true only for 'Other': blocks rename/archive
  status        text not null default 'active' check (status in ('active','archived')),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

insert into pm_taxonomy_categories (name, sort_order, is_protected)
values
  ('Hospital & Surgical',           0, false),
  ('Hospital Income/Cash',          1, false),
  ('Term Life',                     2, false),
  ('Critical Illness',              3, false),
  ('Personal Accident',             4, false),
  ('Outpatient GP',                 5, false),
  ('Outpatient Specialist',         6, false),
  ('Outpatient Diagnostic',         7, false),
  ('Dental',                        8, false),
  ('Optical',                       9, false),
  ('Maternity',                    10, false),
  ('Employee Assistance Program',  11, false),
  ('Major Medical',                12, false),
  ('Disability Income',            13, false),
  ('Travel',                       14, false),
  ('Other',                        15, true)
on conflict (name) do nothing;

create table if not exists pm_taxonomy_synonyms (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid references pm_taxonomy_categories(id),  -- null while status='pending'
  insurer_id     uuid references insurers(id) on delete cascade,  -- null = applies to any insurer
  calculator_id  uuid references pm_calculators(id) on delete set null,  -- upload that first surfaced it

  source         text not null check (source in ('coverage','benefit_term')),
  term           text not null,  -- raw wording as printed (code/full_name or category/label)
  term_norm      text generated always as (lower(regexp_replace(term, '[^a-z0-9]+', ' ', 'g'))) stored,

  status         text not null default 'pending' check (status in ('pending','approved','rejected')),
  confidence     text not null default 'ai' check (confidence in ('ai','human')),

  created_by     uuid,
  approved_by    uuid,
  created_at     timestamptz not null default now(),
  approved_at    timestamptz,

  -- insurer_id is nullable (global synonym); "nulls not distinct" so two global (insurer_id is
  -- null) synonyms for the same term still collide instead of Postgres treating every null as
  -- unique — and it keeps this a plain column-list constraint PostgREST's on_conflict can target.
  unique nulls not distinct (insurer_id, source, term_norm)
);
create index if not exists pm_taxonomy_synonyms_status_idx on pm_taxonomy_synonyms (status, created_at desc);
create index if not exists pm_taxonomy_synonyms_calc_idx on pm_taxonomy_synonyms (calculator_id);

drop trigger if exists pm_taxonomy_categories_touch on pm_taxonomy_categories;
create trigger pm_taxonomy_categories_touch before update on pm_taxonomy_categories
  for each row execute function pm_touch_updated_at();
