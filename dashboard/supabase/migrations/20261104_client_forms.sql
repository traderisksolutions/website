-- Client forms (4 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- The forms, templates and brochures TRS sends clients, by line: a request's data ask and a
-- renewal's data request attach them by rule (src/lib/forms/library.ts). Seeded from what staff
-- actually sent from Jun to Nov 2026; admins add, retire or re-file them on Settings → Client forms.
-- file_ref is a storage path, or gmail:<email_attachments.id> for a file fetched from Gmail on send.
create table if not exists public.client_forms (
  id          uuid primary key default gen_random_uuid(),
  line        text not null,
  flow        text,
  kind        text not null default 'proposal_form' check (kind in ('proposal_form', 'template', 'brochure', 'product_summary', 'claim_form', 'letter')),
  insurer     text,
  title       text not null,
  filename    text not null,
  mime_type   text,
  file_ref    text not null,
  attach_on   text[] not null default array['new_request', 'renewal'],
  active      boolean not null default true,
  sent_count  int not null default 0,
  last_sent   date,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists client_forms_line_idx on public.client_forms (line, active);
alter table public.client_forms enable row level security;
grant select, insert, update, delete on public.client_forms to service_role;
revoke all on public.client_forms from anon;
notify pgrst, 'reload schema';
