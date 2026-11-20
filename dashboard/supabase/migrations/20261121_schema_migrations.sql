-- The migration ledger (21 Nov 2026). scripts/migrate.mjs records every file it applies here, so
-- what has run is held in the database. Additive: one new table, nothing else changes.
-- The files that were applied by hand before this date are recorded as the baseline
-- (baseline = true, checksum null).
create table if not exists public.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now(),
  checksum text,
  baseline boolean not null default false
);

-- Default privileges give anon read on every new table; the ledger is for the service role only.
revoke all on public.schema_migrations from anon, public;
