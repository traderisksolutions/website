-- Data room (29 Oct 2026): every document a client, insurer or TRS produces about a policy, in one
-- register, filed in the company's Drive folder.
--   · one row per document, from an email attachment, an upload (e.g. a PDF sent on WhatsApp) or a
--     document TRS generates (debit notes)
--   · doc_type from the taxonomy in src/lib/documents/taxonomy.ts; classified by filename rules,
--     then the housekeeping agent; a broker can always correct it
--   · linked to a policy when the policy number, insurer or line says which; otherwise it waits in
--     the company's "To sort" tray
--   · filed to Drive under <Company>/Policies/<policy folder>/<group>/ (or <Company>/To sort/)
-- Apply with ~/trs-dn-migration/apply-sql.sh after 20261029_placement_bind.sql. Additive only.

create table if not exists policy_documents (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid references companies(id) on delete set null,
  policy_id           uuid references policies(id) on delete set null,
  placement_line_id   uuid,
  doc_type            text not null default 'other',
  title               text,                       -- short human title, e.g. "Hold cover · Great Eastern"
  filename            text not null,
  mime_type           text,
  size_bytes          integer,
  source              text not null default 'email' check (source in ('email', 'upload', 'generated')),
  email_attachment_id uuid unique,                -- one row per attachment, so ingest is idempotent
  thread_id           uuid,
  message_id          uuid,
  from_address        text,
  received_at         timestamptz,
  insurer_name        text,
  policy_number       text,
  period_from         date,
  period_to           date,
  premium_text        text,
  class_of_insurance  text,                       -- as the document names it, e.g. "Goods in Transit"
  storage_url         text,                       -- path in the attachment store (drive-store)
  sha256              text,                       -- of the bytes: a re-attached copy is filed once
  drive_file_id       text,
  drive_url           text,
  status              text not null default 'unfiled' check (status in ('unfiled', 'filed', 'failed', 'ignored')),
  classified_by       text check (classified_by in ('rule', 'agent', 'broker')),
  confidence          numeric,
  needs_review        boolean not null default false,
  error               text,
  uploaded_by         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists policy_documents_company_idx on policy_documents(company_id, received_at desc);
create index if not exists policy_documents_policy_idx  on policy_documents(policy_id);
create index if not exists policy_documents_sha_idx     on policy_documents(company_id, sha256);
create index if not exists policy_documents_status_idx  on policy_documents(status) where status in ('unfiled', 'failed');

-- A policy's own Drive folder, made the first time a document is filed to it.
alter table policies add column if not exists drive_folder_url text;

grant select, insert, update, delete on policy_documents to service_role;
revoke all on policy_documents from anon;
notify pgrst, 'reload schema';
