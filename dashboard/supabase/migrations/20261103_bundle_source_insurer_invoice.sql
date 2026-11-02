-- Debit note bundles raised by the policy reader from an insurer's tax invoice on a bound policy
-- (3 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
alter table public.debit_note_bundles drop constraint if exists debit_note_bundles_source_check;
alter table public.debit_note_bundles add constraint debit_note_bundles_source_check check (source in ('manual_upload', 'onedrive', 'policy_movement', 'insurer_invoice'));
notify pgrst, 'reload schema';
