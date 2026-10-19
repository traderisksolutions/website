-- Marketing v2 (19 Oct 2026): knowledge file with versions, competitors + GEO analysis,
-- nightly schedule driven by the prompts an analysis found.
--
-- Knowledge: one text file per site, every save a new version. The dashboard mirrors the
-- current version into knowledge_entries (source = 'file') so the Python engine keeps reading
-- the table it already knows.
--
-- Competitors: a list of URLs per site. One analysis run reads their blogs (sitemaps), ranks
-- their pages by how often AI answers cite them, runs the site's prompts through the model with
-- search grounding, and records who is cited and the tone toward the site. Each run is a
-- version in geo_analyses.
--
-- Schedule: marketing_sites.nightly_count + require_approval already hold the cadence;
-- article_length and nightly_time join them. A nightly run that targets a prompt carries
-- prompt_id so the Schedule can show which prompt each night tackled.

create extension if not exists pgcrypto;

-- ── Knowledge file ───────────────────────────────────────────────────────
create table if not exists knowledge_versions (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references marketing_sites(id) on delete cascade,
  version       int  not null,
  text          text not null,
  word_count    int  not null default 0,
  heading_count int  not null default 0,
  created_by    text,
  created_at    timestamptz not null default now(),
  unique (site_id, version)
);
create index if not exists knowledge_versions_site_idx on knowledge_versions (site_id, version desc);

-- ── Cadence ──────────────────────────────────────────────────────────────
alter table marketing_sites add column if not exists nightly_time   text not null default '02:00';   -- SGT, informational until the scheduler is per site
alter table marketing_sites add column if not exists article_length text not null default 'standard' check (article_length in ('standard','long'));

-- ── Competitors ──────────────────────────────────────────────────────────
create table if not exists marketing_competitors (
  id               uuid primary key default gen_random_uuid(),
  site_id          uuid not null references marketing_sites(id) on delete cascade,
  name             text not null,
  url              text not null,              -- homepage as pasted, normalised to https://host
  domain           text not null,              -- host without www
  blog_url         text,                       -- found by the sweep, editable
  sitemap_url      text,
  status           text not null default 'active' check (status in ('active','removed')),
  pages_count      int  not null default 0,
  best_page_url    text,
  best_page_note   text,                       -- 'cited in 7 answers · top 10 for 9 searches'
  cited_count      int  not null default 0,    -- prompts (of the last analysis) that cited this domain
  search_hits      int  not null default 0,    -- searches (of the last analysis) with this domain in the results
  last_analysed_at timestamptz,
  added_by         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (site_id, domain)
);
create index if not exists marketing_competitors_site_idx on marketing_competitors (site_id) where status = 'active';

create table if not exists competitor_pages (
  id             uuid primary key default gen_random_uuid(),
  competitor_id  uuid not null references marketing_competitors(id) on delete cascade,
  site_id        uuid not null references marketing_sites(id) on delete cascade,
  url            text not null,
  title          text,
  published_at   date,
  cited_count    int  not null default 0,
  search_hits    int  not null default 0,
  last_seen_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (competitor_id, url)
);
create index if not exists competitor_pages_site_idx on competitor_pages (site_id, cited_count desc, search_hits desc);

-- ── GEO analysis ─────────────────────────────────────────────────────────
create table if not exists geo_analyses (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references marketing_sites(id) on delete cascade,
  version         int  not null,
  status          text not null default 'queued' check (status in ('queued','running','completed','failed')),
  pages_read      int  not null default 0,
  prompts_checked int  not null default 0,
  cited_count     int  not null default 0,    -- prompts whose answer cited the site itself
  cost_usd        numeric not null default 0,
  model           text,
  summary         jsonb not null default '{}', -- per-competitor counts, errors, timings
  error           text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_by      text,
  created_at      timestamptz not null default now(),
  unique (site_id, version)
);
create index if not exists geo_analyses_site_idx on geo_analyses (site_id, version desc);
create index if not exists geo_analyses_queue_idx on geo_analyses (status, created_at) where status in ('queued','running');

create table if not exists geo_prompts (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references marketing_sites(id) on delete cascade,
  prompt       text not null,                  -- as a person asks an AI assistant
  search_query text not null default '',       -- as the same person types it into Google
  impressions  int,                            -- from Search Console when the query matches; null otherwise
  source       text not null default 'analysis' check (source in ('analysis','manual','search_console')),
  selected     boolean not null default false, -- ticked = the nightly batch may write for it
  archived     boolean not null default false,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (site_id, prompt)
);
create index if not exists geo_prompts_site_idx on geo_prompts (site_id) where not archived;

create table if not exists geo_prompt_results (
  id             uuid primary key default gen_random_uuid(),
  analysis_id    uuid not null references geo_analyses(id) on delete cascade,
  site_id        uuid not null references marketing_sites(id) on delete cascade,
  prompt_id      uuid not null references geo_prompts(id) on delete cascade,
  cited_domains  text[] not null default '{}',
  cited_urls     text[] not null default '{}',
  search_urls    text[] not null default '{}', -- top results for search_query
  us_cited       boolean not null default false,
  tone           text not null default 'not_mentioned' check (tone in ('positive','neutral','negative','not_mentioned')),
  answer_excerpt text,
  created_at     timestamptz not null default now(),
  unique (analysis_id, prompt_id)
);
create index if not exists geo_prompt_results_analysis_idx on geo_prompt_results (analysis_id);

-- ── Runs know which prompt they tackled ──────────────────────────────────
alter table blog_generation_runs add column if not exists prompt_id uuid references geo_prompts(id) on delete set null;
create index if not exists blog_generation_runs_prompt_idx on blog_generation_runs (prompt_id) where prompt_id is not null;
