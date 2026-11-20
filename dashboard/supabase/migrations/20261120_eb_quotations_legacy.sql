-- Older quotations re-priced into eb_quotations (20 Nov 2026). Additive; safe to re-run.
-- Apply with ~/trs-dn-migration/apply-sql.sh, on Jarod's go only.
--
-- legacy_gb_id  the gb_quotations row a quotation was re-priced from (scripts/eb-reprice-legacy.ts).
--               Unique, so the script skips a row already moved and a second run adds nothing.

alter table public.eb_quotations add column if not exists legacy_gb_id uuid;

create unique index if not exists eb_quotations_legacy_gb_id
  on public.eb_quotations (legacy_gb_id) where legacy_gb_id is not null;

notify pgrst, 'reload schema';
