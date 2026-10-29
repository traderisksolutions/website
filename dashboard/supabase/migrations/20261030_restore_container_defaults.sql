-- Restore empty defaults lost when the database moved to Cloud SQL (Oct 2026). Columns are
-- NOT NULL with no default, so any insert that leaves them out failed: creating an insurer
-- (companies.owner_emails), adding an underwriter or any new contact (contacts.crm_data), and
-- others. Found by the 30 Oct 2026 email-in dogfood run. Additive only: no data changes.
alter table companies         alter column domains          set default '{}';
alter table companies         alter column owner_emails     set default '{}';
alter table contacts          alter column crm_data         set default '{}'::jsonb;
alter table contacts          alter column tags             set default '{}';
alter table board_tasks       alter column collaborators    set default '{}';
alter table debit_notes       alter column attachment_files set default '[]'::jsonb;
alter table chat_messages     alter column citations_json   set default '[]'::jsonb;
alter table chat_messages     alter column metadata_json    set default '{}'::jsonb;
alter table gb_rates          alter column dimensions       set default '{}'::jsonb;
alter table gb_coverage       alter column dimensions       set default '{}'::jsonb;
alter table dev_logs          alter column changes          set default '{}';
notify pgrst, 'reload schema';
