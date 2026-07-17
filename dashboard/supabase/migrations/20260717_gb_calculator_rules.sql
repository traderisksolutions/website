-- Pricing Matrix: attach an insurer's Excel calculator (rules layer) to a rate table.
-- The xlsx supplies the calculation LOGIC (age basis, GST, group-size discount,
-- renewal-only bands, rider deps, occupation class); the rate NUMBERS still come from
-- the rate PDF. One calculator per rate table (1:1).
ALTER TABLE gb_rate_tables
  ADD COLUMN IF NOT EXISTS calculator_path     text,        -- storage path of the uploaded xlsx
  ADD COLUMN IF NOT EXISTS calculator_filename text,        -- original filename (display)
  ADD COLUMN IF NOT EXISTS rules               jsonb,       -- approved/applied rules (compiler "rules")
  ADD COLUMN IF NOT EXISTS rules_log           jsonb,       -- audit: structural_map + detection_log + warnings
  ADD COLUMN IF NOT EXISTS rules_status        text NOT NULL DEFAULT 'none',  -- none|analyzing|in_review|approved|error
  ADD COLUMN IF NOT EXISTS rules_updated_at    timestamptz;
