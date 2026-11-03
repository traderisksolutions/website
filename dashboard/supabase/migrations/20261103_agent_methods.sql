-- Agent methods (3 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- One plain-text method per key ('renewal' first): how a renewal is judged and drafted. Admins
-- edit it on /methods/renewal; every save is a new version, nothing is overwritten. The rules read
-- the thresholds and overrides from the latest version on every run; the AI agents read the whole
-- text. src/lib/methods/method.ts parses it.
create table if not exists public.agent_methods (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  version    int  not null,
  text       text not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (key, version)
);
create index if not exists agent_methods_key_idx on public.agent_methods (key, version desc);
alter table public.agent_methods enable row level security;
grant select, insert on public.agent_methods to service_role;
revoke all on public.agent_methods from anon;
notify pgrst, 'reload schema';
