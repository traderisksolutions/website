-- TRS Website Analytics Schema
-- Run this in your Supabase SQL editor after creating your project

-- ── Sessions ──────────────────────────────────────────────────────────────
create table if not exists sessions (
  id            uuid        primary key default gen_random_uuid(),
  session_id    text        unique not null,
  first_page    text,
  referrer      text,
  user_agent    text,
  language      text,
  screen_width  int,
  screen_height int,
  page_count    int         default 1,
  created_at    timestamptz default now(),
  last_seen_at  timestamptz default now()
);

-- ── Page views ─────────────────────────────────────────────────────────────
create table if not exists page_views (
  id          uuid        primary key default gen_random_uuid(),
  session_id  text        not null references sessions(session_id) on delete cascade,
  page        text        not null,
  referrer    text,
  created_at  timestamptz default now()
);

-- ── Events (button clicks, interactions) ───────────────────────────────────
create table if not exists events (
  id            uuid        primary key default gen_random_uuid(),
  session_id    text        not null references sessions(session_id) on delete cascade,
  event_type    text        not null,  -- 'button_click'
  page          text,
  element_label text,                  -- e.g. 'get_quote_hero', 'whatsapp_send'
  element_id    text,
  metadata      jsonb,
  created_at    timestamptz default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_sessions_created   on sessions  (created_at);
create index if not exists idx_page_views_session on page_views (session_id);
create index if not exists idx_page_views_page    on page_views (page);
create index if not exists idx_page_views_created on page_views (created_at);
create index if not exists idx_events_session     on events    (session_id);
create index if not exists idx_events_label       on events    (element_label);
create index if not exists idx_events_created     on events    (created_at);

-- ── Row Level Security ─────────────────────────────────────────────────────
alter table sessions  enable row level security;
alter table page_views enable row level security;
alter table events    enable row level security;

-- Anonymous visitors can INSERT (website tracking)
create policy "anon_insert_sessions"   on sessions   for insert with check (true);
create policy "anon_insert_page_views" on page_views for insert with check (true);
create policy "anon_insert_events"     on events     for insert with check (true);

-- Only authenticated users (you) can UPDATE sessions
create policy "anon_update_sessions"   on sessions   for update using (true);

-- Only authenticated users can SELECT
create policy "auth_read_sessions"     on sessions   for select using (auth.role() = 'authenticated');
create policy "auth_read_page_views"   on page_views for select using (auth.role() = 'authenticated');
create policy "auth_read_events"       on events     for select using (auth.role() = 'authenticated');
