-- An insurer's movement note goes to the debit-note review queue as a bundle; approval links the TRS note back.
begin;
alter table policy_transactions add column if not exists bundle_id uuid references debit_note_bundles(id) on delete set null;
alter table debit_note_bundles drop constraint if exists debit_note_bundles_source_check;
alter table debit_note_bundles add constraint debit_note_bundles_source_check check (source in ('manual_upload','onedrive','policy_movement'));
notify pgrst, 'reload schema';
commit;
