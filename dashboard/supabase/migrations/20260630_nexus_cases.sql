-- Nexus v2.0 — Cases, Thread Linking, Attachments, and Analysis Storage
-- Run this in the Supabase SQL editor.

-- ── 1. Cases ─────────────────────────────────────────────────────────────────

create table if not exists cases (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  description text,
  status      text not null default 'open',  -- open | closed | archived
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── 2. Case → Thread links ────────────────────────────────────────────────────

create table if not exists case_threads (
  id          uuid default gen_random_uuid() primary key,
  case_id     uuid not null references cases(id) on delete cascade,
  thread_id   uuid not null,    -- references email_threads.id
  party_type  text not null default 'client',  -- client | insurer | lawyer | regulator | other
  party_label text,             -- custom label e.g. "QBE Marine", "Rajah & Tann"
  created_at  timestamptz default now(),
  unique(case_id, thread_id)
);

create index if not exists case_threads_case_id_idx    on case_threads(case_id);
create index if not exists case_threads_thread_id_idx  on case_threads(thread_id);

-- ── 3. Email Attachments ──────────────────────────────────────────────────────

create table if not exists email_attachments (
  id                  uuid default gen_random_uuid() primary key,
  message_id          uuid not null,    -- references email_messages.id
  thread_id           uuid not null,    -- references email_threads.id
  gmail_attachment_id text,
  filename            text not null,
  mime_type           text,
  size_bytes          integer,
  parsed_text         text,             -- extracted text content (PDF/DOCX/XLSX → text)
  gemini_file_uri     text,             -- if uploaded to Gemini Files API
  parsed_at           timestamptz,
  created_at          timestamptz default now()
);

create index if not exists email_attachments_message_id_idx on email_attachments(message_id);
create index if not exists email_attachments_thread_id_idx  on email_attachments(thread_id);

-- ── 4. Case Analyses ─────────────────────────────────────────────────────────

create table if not exists case_analyses (
  id                  uuid default gen_random_uuid() primary key,
  case_id             uuid not null references cases(id) on delete cascade,
  historical_timeline jsonb,     -- TimelineEvent[]
  current_status      jsonb,     -- { summary, blocking_issues, pending_from }
  playbook            jsonb,     -- PlaybookStep[]
  outreach_strategy   jsonb,     -- Record<partyType, { tone, key_message, timing }>
  legal_research      jsonb,     -- { singapore_relevance, applicable_regulations, sources }
  synthesis_model     text,      -- "gemini-2.5-pro" | "gemini-2.5-flash"
  strategy_model      text,      -- "claude-opus-4-8" | "gemini-2.5-pro" (fallback)
  gemini_tokens       integer,
  claude_tokens       integer,
  created_at          timestamptz default now()
);

create index if not exists case_analyses_case_id_idx on case_analyses(case_id);
