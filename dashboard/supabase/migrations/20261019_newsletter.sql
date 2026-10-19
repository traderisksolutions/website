-- Newsletter: readers subscribe on a site (double opt-in), staff build a weekly issue from the
-- site's published articles, approve it, and it sends through the dashboard's Gmail connection.
-- Per site, so Benefixe and New South Sea can use it later.

alter table marketing_sites add column if not exists newsletter_sender_email text;   -- a verified "Send mail as" alias
alter table marketing_sites add column if not exists newsletter_sender_name  text;

create table if not exists newsletter_subscribers (
  id               uuid primary key default gen_random_uuid(),
  site_id          uuid not null references marketing_sites(id),
  email            text not null,
  status           text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  source_url       text,
  confirm_sent_at  timestamptz,
  confirmed_at     timestamptz,
  unsubscribed_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (site_id, email)
);
create index if not exists newsletter_subscribers_site_idx on newsletter_subscribers (site_id, status);

create table if not exists newsletter_issues (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references marketing_sites(id),
  subject      text not null,
  intro        text not null default '',
  article_ids  uuid[] not null default '{}',
  status       text not null default 'draft' check (status in ('draft', 'sending', 'sent')),
  test_sent_at timestamptz,
  approved_by  text,
  approved_at  timestamptz,
  sent_at      timestamptz,
  recipients   int not null default 0,
  failures     int not null default 0,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists newsletter_issues_site_idx on newsletter_issues (site_id, created_at desc);

create table if not exists newsletter_sends (
  issue_id      uuid not null references newsletter_issues(id) on delete cascade,
  subscriber_id uuid not null references newsletter_subscribers(id) on delete cascade,
  status        text not null check (status in ('sent', 'failed')),
  gmail_id      text,
  error         text,
  at            timestamptz not null default now(),
  primary key (issue_id, subscriber_id)
);

grant select, insert, update, delete on newsletter_subscribers, newsletter_issues, newsletter_sends to service_role;
revoke all on newsletter_subscribers, newsletter_issues, newsletter_sends from anon;

notify pgrst, 'reload schema';
