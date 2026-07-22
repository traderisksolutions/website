-- Pricing Matrix — live progress for the Auto-map / pricing extraction (Opus + Gemini + judge).
-- The map route writes {step,total,label} here as it works; the review page polls it to drive a
-- progress bar. Run in the Supabase SQL editor.

alter table pm_calculators add column if not exists map_progress jsonb;
