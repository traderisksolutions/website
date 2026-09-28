-- The key registry behind src/lib/api-gate — one row per application
-- allowed to call /api/**, so "which programs can reach this database" is
-- a table you can read rather than a set of secrets spread across Vercel
-- environment variables.
--
-- Until this existed, middleware.ts excluded /api/ twice over (once in
-- PUBLIC_PATHS, again in the matcher), so each of the 247 route handlers
-- was solely responsible for its own check. Most called
-- requireStaffOrCron(). /api/inbound/draft did not, and spent Gemini
-- quota for anyone who asked.
--
-- Every /api/** request now carries two independent credentials: a key
-- from this table (which application) and an actor — a signed-in
-- @trade-risksol.com user or the CRON_SECRET bearer (on whose authority).
-- Scope follows the credential type: a browser key is only valid next to
-- a session, a machine key only next to CRON_SECRET.

create table if not exists public.api_clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  -- 'browser' pairs with a session, 'machine' with CRON_SECRET.
  kind        text not null check (kind in ('browser', 'machine')),
  -- First 12 characters of the issued key, in clear. The lookup handle,
  -- and what logs and the CLI print, so a key can be named without being
  -- held.
  key_prefix  text not null unique,
  -- SHA-256 of the full key, hex. A fast hash is correct for 192 bits of
  -- CSPRNG output: there is no dictionary for a slow KDF to frustrate,
  -- and this is read on every API request. The comparison is constant
  -- time regardless (src/lib/api-gate/keys.ts).
  key_hash    text not null,
  scopes      text[] not null default '{}',
  status      text not null default 'active' check (status in ('active', 'revoked')),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- The gate looks a key up by prefix on every API request; this is the one
-- index that matters.
create index if not exists api_clients_key_prefix_idx on public.api_clients (key_prefix);

-- RLS on, and deliberately NO policies.
--
-- That is not an oversight, it is the intent. This table holds the hashes
-- that authenticate every API caller, and nothing reaching Supabase as
-- `anon` or `authenticated` has any business reading it — not even to
-- count rows. service_role bypasses RLS, and the gate runs as service_role
-- from middleware, so the only reader is the gate itself.
--
-- Worth stating plainly because the rest of this schema does not work
-- this way: most staff_* policies here are `auth.role() = 'authenticated'`,
-- which is every signed-in user with no further scoping. If that pattern
-- were copied onto this table, any signed-in session could read every key
-- hash in the system.
alter table public.api_clients enable row level security;

revoke all on public.api_clients from anon, authenticated;
