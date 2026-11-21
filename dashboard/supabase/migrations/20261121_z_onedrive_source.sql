-- Filing from OneDrive/SharePoint (21 Nov 2026, docs/eb-v2.md P7, decision D4: built now, switched off
-- until the Microsoft connection is approved). Additive; safe to re-run. Apply with the runner on
-- Jarod's go. Named to sort after 20261121_y_attachment_drive_copy.sql.
--
-- A file picked up from the watched Microsoft folder becomes a data-room record like an email
-- attachment, with source 'onedrive' and the item it came from.

alter table public.policy_documents drop constraint if exists policy_documents_source_check;
alter table public.policy_documents add constraint policy_documents_source_check check (source in ('email', 'upload', 'generated', 'onedrive'));
alter table public.policy_documents add column if not exists external_item_id text;
create unique index if not exists policy_documents_external_item_key on public.policy_documents (external_item_id) where external_item_id is not null;
