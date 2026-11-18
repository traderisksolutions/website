-- Brochure library (19 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- One row per version of a product's brochure and rate file. The files sit in Google Drive, one
-- folder per version; this row holds what Drive cannot: the line, the version label, the in-force
-- date and a note. Status is worked out from the dates (src/lib/brochures/library.ts); only
-- 'removed' is set by hand, and removing never deletes the Drive files.
--
-- line             Employment Benefits | Travel | Personal Accident | SME Package | Professional Indemnity | Cyber
-- product          the product folder's name in Drive
-- version          v14, 2026, ...
-- in_force_from    the date quotes start using this version
-- drive_folder_id  the version folder in Drive
-- files            [{ id, name, kind, url }] uploaded through the page
-- status           in_force | superseded | removed

create table if not exists public.brochure_versions (
  id              uuid primary key default gen_random_uuid(),
  line            text not null,
  product         text not null,
  version         text not null,
  in_force_from   date,
  drive_folder_id text,
  drive_url       text,
  files           jsonb not null default '[]'::jsonb,
  note            text,
  status          text not null default 'in_force' check (status in ('in_force', 'superseded', 'removed')),
  created_by      text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists brochure_versions_product on public.brochure_versions (product, in_force_from desc);
create unique index if not exists brochure_versions_folder on public.brochure_versions (drive_folder_id) where drive_folder_id is not null;

grant all on table public.brochure_versions to service_role;

notify pgrst, 'reload schema';
