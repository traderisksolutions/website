-- Pricing Matrix: surface live extraction progress (a step checklist like Nexus) by
-- recording which phase the extractor is in. Run in the Supabase SQL editor.

alter table gb_rate_tables
  add column if not exists extract_stage text;
