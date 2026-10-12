-- Marketing: GEO/SEO article generation for every website the business owns.
--
-- One knowledge bank, one engine, one article library per site. The Python
-- content engine (content-engine/) writes blog_generation_* and cms_articles;
-- the dashboard reads them and the public blog API serves published
-- articles to each site.

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ── Sites ────────────────────────────────────────────────────────────────
create table if not exists marketing_sites (
  id               uuid primary key default gen_random_uuid(),
  key              text not null unique,                 -- 'corpcover'
  name             text not null,                        -- 'Corp Cover'
  domain           text not null unique,                 -- 'corpcover.com'
  base_url         text not null,                        -- 'https://corpcover.com'
  blog_base_path   text not null default '/blog',        -- where the site renders articles
  contact_url      text not null default '',             -- every CTA links here
  business_name    text not null,                        -- JSON-LD publisher
  markets          text[] not null default '{SG}',       -- first = home market
  brand_terms      text[] not null default '{}',         -- searches to ignore as targets
  topic_terms      text[] not null default '{}',         -- a search must contain one (empty = any)
  pillar_pages     jsonb  not null default '[]',         -- [{url,title}] service pages to link to
  topics           text[] not null default '{}',         -- the site's article topic labels
  banned_terms     text[] not null default '{}',         -- the quality gate holds any article naming these
  require_approval boolean not null default true,
  nightly_count    int not null default 0 check (nightly_count between 0 and 12),
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

insert into marketing_sites (id, key, name, domain, base_url, blog_base_path, contact_url, business_name, markets, brand_terms, topic_terms, pillar_pages, topics, banned_terms, sort_order) values
  ('b1000000-0000-4000-8000-000000000001', 'corpcover', 'Corp Cover', 'corpcover.com', 'https://corpcover.com', '/articles', 'https://corpcover.com/#start', 'Corp Cover',
   '{SG}', '{"corp cover","corpcover"}',
   '{insurance,cover,policy,liability,"work injury",wica,property,"directors and officers",fire,"public liability","professional indemnity",employer,"business insurance"}',
   '[{"url":"https://corpcover.com/articles","title":"Business insurance guides"}]',
   '{"Required by law",Liability,Property,Directors}',
   '{MAS,"Monetary Authority of Singapore","Dollar Bureau",corporatecover.sg}', 1),
  ('b1000000-0000-4000-8000-000000000002', 'benefixe', 'Benefixe', 'benefixe.com', 'https://benefixe.com', '/blogs', 'https://benefixe.com/#contact', 'Benefixe',
   '{SG}', '{benefixe}',
   '{"group insurance","group benefits","employee benefits",perks,medical,hospitalisation,employer,"staff benefits"}',
   '[{"url":"https://benefixe.com/blogs","title":"Group benefits and perks"}]',
   '{"Group insurance",Perks,Employers}', '{}', 2),
  ('b1000000-0000-4000-8000-000000000003', 'newsouthsea', 'New South Sea', 'newsouthsea.com', 'https://newsouthsea.com', '/blog', 'https://newsouthsea.com', 'New South Sea',
   '{SG}', '{"new south sea",newsouthsea}', '{}', '[]', '{}', '{}', 3),
  ('b1000000-0000-4000-8000-000000000004', 'traderisksolutions', 'Trade Risk Solutions', 'traderisksolutions.com.sg', 'https://traderisksolutions.com.sg', '/blog', 'https://traderisksolutions.com.sg/contact', 'Trade Risk Solutions Pte Ltd',
   '{SG,HK,MY,ID}', '{"trade risk solutions",trs}',
   '{insurance,"trade credit",marine,cargo,bond,guarantee,"credit insurance",broker,cover,policy,"political risk"}',
   '[{"url":"https://traderisksolutions.com.sg","title":"Trade Risk Solutions"}]', '{}', '{}', 4)
on conflict (key) do nothing;

-- ── Knowledge bank ──────────────────────────────────────────────────────
create table if not exists knowledge_entries (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references marketing_sites(id) on delete cascade,
  section         text not null check (section in ('business','product','case_study','claim','market','document')),
  title           text not null,
  body            text not null,
  attributes      jsonb not null default '{}',
  markets         text[] not null default '{}',   -- empty = every market
  language        text not null default 'en',
  status          text not null default 'draft' check (status in ('draft','verified','archived')),
  priority        int not null default 0 check (priority between 0 and 10),
  embedding       vector(1536),
  embedding_model text,
  source          text not null default 'manual',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      text
);
create index if not exists knowledge_entries_site_idx on knowledge_entries (site_id, section) where status <> 'archived';

-- Per-node system prompt overrides, read by the engine at the start of a run.
create table if not exists agent_prompt_templates (
  id                     uuid primary key default gen_random_uuid(),
  site_id                uuid not null references marketing_sites(id) on delete cascade,
  pipeline               text not null default 'engine',
  node_key               text not null,
  system_prompt_override text,
  updated_at             timestamptz not null default now(),
  updated_by             text,
  unique (site_id, pipeline, node_key)
);

-- ── Generation runs ─────────────────────────────────────────────────────
create table if not exists blog_generation_runs (
  id                  uuid primary key default gen_random_uuid(),
  site_id             uuid not null references marketing_sites(id) on delete cascade,
  status              text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  setup               jsonb not null default '{}',
  targets             jsonb not null default '[]',
  primary_target_id   text,
  primary_target_type text,
  primary_target_name text,
  article_id          uuid,
  content_plan        jsonb,       -- engine_state: completed stages + outputs, resumable
  geo_research        jsonb,
  draft               jsonb,
  geo_quality         jsonb,
  warnings            jsonb,
  error               text,
  triggered_by        text not null default 'manual',   -- manual | scheduled | retry
  created_by          text,
  started_at          timestamptz,
  completed_at        timestamptz,
  total_duration_ms   int,
  created_at          timestamptz not null default now()
);
create index if not exists blog_generation_runs_site_idx on blog_generation_runs (site_id, created_at desc);
create index if not exists blog_generation_runs_queue_idx on blog_generation_runs (status, created_at) where status in ('queued','running');

create table if not exists blog_generation_nodes (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references blog_generation_runs(id) on delete cascade,
  site_id        uuid not null references marketing_sites(id) on delete cascade,
  node_key       text not null,
  label          text not null,
  type           text not null,   -- retrieval | agent | validation | formatting | persistence
  status         text not null default 'queued' check (status in ('queued','running','completed','failed','skipped')),
  sort_order     int not null default 0,
  started_at     timestamptz,
  completed_at   timestamptz,
  duration_ms    int,
  input_summary  text,
  output_summary text,
  prompt         text,
  model          text,
  token_usage    jsonb,
  source_ids     text[] not null default '{}',
  citations      text[] not null default '{}',
  error          text,
  metadata       jsonb not null default '{}',
  unique (run_id, node_key)
);

create table if not exists blog_generation_events (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references blog_generation_runs(id) on delete cascade,
  site_id    uuid not null references marketing_sites(id) on delete cascade,
  node_key   text,
  level      text not null default 'info',   -- info | success | warning | error
  message    text not null,
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists blog_generation_events_run_idx on blog_generation_events (run_id, created_at);

create table if not exists blog_generation_sources (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references blog_generation_runs(id) on delete cascade,
  site_id         uuid not null references marketing_sites(id) on delete cascade,
  node_key        text,
  doc_id          text not null,
  source_type     text not null default 'knowledge_entry',
  title           text,
  url             text,
  excerpt         text,
  score           numeric,
  used_in         text[] not null default '{}',
  citation_status text not null default 'unsupported',
  created_at      timestamptz not null default now()
);
create index if not exists blog_generation_sources_run_idx on blog_generation_sources (run_id);

-- ── Articles ────────────────────────────────────────────────────────────
create table if not exists cms_articles (
  id                 uuid primary key default gen_random_uuid(),
  site_id            uuid not null references marketing_sites(id) on delete cascade,
  title              text not null,
  slug               text not null,
  excerpt            text,                    -- the dek under the title on the site
  topic              text,                    -- one of marketing_sites.topics
  content_html       text not null default '',
  content_json       jsonb not null default '{}',   -- {format:'markdown', markdown, faq, ...}
  meta_description   text,
  schema_jsonld      jsonb,
  status             text not null default 'draft' check (status in ('draft','pending','published','archived')),
  category           text not null default 'manual',   -- engine | manual | import
  language           text not null default 'en',
  market             text not null default 'SG',
  word_count         int,
  quality_score      numeric,
  cover_image_url    text,
  cover_image_credit text,
  approved_at        timestamptz,
  approved_by        text,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         text,
  unique (site_id, slug)
);
create index if not exists cms_articles_site_status_idx on cms_articles (site_id, status, published_at desc);

alter table blog_generation_runs
  add constraint blog_generation_runs_article_fk foreign key (article_id) references cms_articles(id) on delete set null;

create table if not exists content_spend (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references marketing_sites(id) on delete cascade,
  article_id uuid references cms_articles(id) on delete set null,
  kind       text not null default 'article',
  cost_usd   numeric not null default 0,
  source     text,
  created_at timestamptz not null default now()
);
create index if not exists content_spend_site_idx on content_spend (site_id, created_at desc);

-- ── Search Console ──────────────────────────────────────────────────────
create table if not exists gsc_connections (
  site_id                 uuid primary key references marketing_sites(id) on delete cascade,
  google_email            text,
  property_url            text,
  available_sites         jsonb not null default '[]',
  refresh_token_encrypted text,
  scope                   text,
  status                  text not null default 'disconnected' check (status in ('connected','needs_property','error','disconnected')),
  last_error              text,
  last_synced_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists gsc_daily (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references marketing_sites(id) on delete cascade,
  date        date not null,
  impressions int not null default 0,
  clicks      int not null default 0,
  ctr         numeric not null default 0,
  position    numeric not null default 0,
  created_at  timestamptz not null default now(),
  unique (site_id, date)
);

create table if not exists gsc_pages (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references marketing_sites(id) on delete cascade,
  page        text not null,
  impressions int not null default 0,
  clicks      int not null default 0,
  ctr         numeric not null default 0,
  position    numeric not null default 0,
  window_days int not null default 28,
  synced_at   timestamptz not null default now()
);
create index if not exists gsc_pages_site_idx on gsc_pages (site_id, impressions desc);

create table if not exists gsc_queries (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references marketing_sites(id) on delete cascade,
  query       text not null,
  impressions int not null default 0,
  clicks      int not null default 0,
  ctr         numeric not null default 0,
  position    numeric not null default 0,
  window_days int not null default 28,
  synced_at   timestamptz not null default now()
);
create index if not exists gsc_queries_site_idx on gsc_queries (site_id, impressions desc);

create table if not exists gsc_query_pages (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references marketing_sites(id) on delete cascade,
  query       text not null,
  page        text not null,
  impressions int not null default 0,
  clicks      int not null default 0,
  ctr         numeric not null default 0,
  position    numeric not null default 0,
  window_days int not null default 28,
  synced_at   timestamptz not null default now()
);
create index if not exists gsc_query_pages_site_idx on gsc_query_pages (site_id);

notify pgrst, 'reload schema';
