-- Gmail-style floating AI chat (consultant) — persistent per-user chat.
-- Four tables + updated_at trigger + indexes + owner-only RLS.
-- Extensible for future team/shared chat (workspace_id), citations, agent logs.
-- Run in the Supabase SQL editor.

-- ── updated_at trigger helper ─────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── chat_threads ──────────────────────────────────────────────────────────────
create table if not exists chat_threads (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  workspace_id    uuid,
  title           text,
  status          text not null default 'open'
                  check (status in ('open','minimized','closed','archived')),
  kind            text not null default 'assistant'
                  check (kind in ('assistant','support','draft')),
  -- Optional link to the Nexus case this chat is steering (case-aware context).
  case_id         uuid,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz
);

-- ── chat_messages ─────────────────────────────────────────────────────────────
create table if not exists chat_messages (
  id             uuid primary key default gen_random_uuid(),
  thread_id      uuid not null references chat_threads(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,
  role           text not null check (role in ('user','assistant','system','tool')),
  content        text not null default '',
  message_status text not null default 'complete'
                 check (message_status in ('draft','streaming','complete','error')),
  citations_json jsonb not null default '[]'::jsonb,
  metadata_json  jsonb not null default '{}'::jsonb,   -- proposed action, model, tokens
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── chat_drafts ───────────────────────────────────────────────────────────────
create table if not exists chat_drafts (
  thread_id  uuid primary key references chat_threads(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  draft_text text not null default '',
  draft_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── chat_ui_state ─────────────────────────────────────────────────────────────
create table if not exists chat_ui_state (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  active_thread_id uuid references chat_threads(id) on delete set null,
  is_open          boolean not null default false,
  is_minimized     boolean not null default false,
  window_mode      text not null default 'floating'
                   check (window_mode in ('floating','docked','hidden')),
  updated_at       timestamptz not null default now()
);

-- ── updated_at triggers ───────────────────────────────────────────────────────
drop trigger if exists trg_chat_threads_updated  on chat_threads;
create trigger trg_chat_threads_updated  before update on chat_threads  for each row execute function set_updated_at();
drop trigger if exists trg_chat_messages_updated on chat_messages;
create trigger trg_chat_messages_updated before update on chat_messages for each row execute function set_updated_at();
drop trigger if exists trg_chat_drafts_updated   on chat_drafts;
create trigger trg_chat_drafts_updated   before update on chat_drafts   for each row execute function set_updated_at();
drop trigger if exists trg_chat_ui_state_updated on chat_ui_state;
create trigger trg_chat_ui_state_updated before update on chat_ui_state for each row execute function set_updated_at();

-- ── indexes ───────────────────────────────────────────────────────────────────
create index if not exists chat_threads_user_status_idx on chat_threads(user_id, status, updated_at desc);
create index if not exists chat_messages_thread_idx      on chat_messages(thread_id, created_at asc);
create index if not exists chat_drafts_user_idx          on chat_drafts(user_id, updated_at desc);

-- ── RLS: owner-only ───────────────────────────────────────────────────────────
alter table chat_threads   enable row level security;
alter table chat_messages  enable row level security;
alter table chat_drafts    enable row level security;
alter table chat_ui_state  enable row level security;

-- threads: you can only touch your own
drop policy if exists chat_threads_owner on chat_threads;
create policy chat_threads_owner on chat_threads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- messages: only if the parent thread is yours
drop policy if exists chat_messages_owner on chat_messages;
create policy chat_messages_owner on chat_messages
  for all
  using      (exists (select 1 from chat_threads t where t.id = chat_messages.thread_id and t.user_id = auth.uid()))
  with check (exists (select 1 from chat_threads t where t.id = chat_messages.thread_id and t.user_id = auth.uid()));

-- drafts: your own
drop policy if exists chat_drafts_owner on chat_drafts;
create policy chat_drafts_owner on chat_drafts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ui state: your own
drop policy if exists chat_ui_state_owner on chat_ui_state;
create policy chat_ui_state_owner on chat_ui_state
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
