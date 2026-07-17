-- Persist the quote basis (New Business vs Renewal) so exports/reopened quotes reflect it.
ALTER TABLE gb_quotations
  ADD COLUMN IF NOT EXISTS basis text NOT NULL DEFAULT 'new_business';
