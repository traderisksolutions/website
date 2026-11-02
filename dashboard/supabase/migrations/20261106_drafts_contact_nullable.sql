-- ai_drafts.contact_id (6 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- The case agents draft to recipients who are not yet in contacts (an insurer desk, a new
-- client contact). The NOT NULL on contact_id made every such draft fail, which failed the
-- whole case read. A draft needs a recipient address, not a contact row.
alter table public.ai_drafts alter column contact_id drop not null;
notify pgrst, 'reload schema';
