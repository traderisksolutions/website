-- Group Benefits (Phase 4): store the Opus-written coverage comparison + recommendation
-- alongside the quotation, so history shows the full pros/cons narrative. Run in Supabase.

alter table gb_quotations
  add column if not exists benefits_analysis jsonb;
