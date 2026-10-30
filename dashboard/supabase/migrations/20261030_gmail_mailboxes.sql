-- Personal mailboxes a person connected with one consent (read-only Gmail). The refresh token is
-- encrypted with a key derived from AUTH_SECRET; nothing here is readable without it.
create table if not exists gmail_mailboxes (
  email              text primary key,
  refresh_token_enc  text not null,
  status             text not null default 'active' check (status in ('active', 'revoked', 'error')),
  history_id         text,
  watch_expiration   timestamptz,
  connected_at       timestamptz not null default now(),
  last_ingest_at     timestamptz,
  last_error         text,
  updated_at         timestamptz not null default now()
);
-- The same conversation has a different Gmail thread id in every mailbox it sits in. Each
-- mailbox's id points at the one email_threads row.
create table if not exists email_thread_aliases (
  mailbox          text not null,
  gmail_thread_id  text not null,
  thread_id        uuid not null references email_threads(id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (mailbox, gmail_thread_id)
);
-- An email copied to several mailboxes is stored once: found by its Message-ID header.
create index if not exists email_messages_rfc822_idx on email_messages(rfc822_message_id);
notify pgrst, 'reload schema';
