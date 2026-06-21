-- ── Migration: contacts – company_domain + prospect stage ────────────────────
-- Run in Supabase SQL editor.

-- 1. Drop existing engagement_stage CHECK constraint (name may vary — find it)
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'contacts'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%engagement_stage%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE contacts DROP CONSTRAINT %I', cname);
    RAISE NOTICE 'Dropped constraint: %', cname;
  ELSE
    RAISE NOTICE 'No engagement_stage constraint found — nothing to drop';
  END IF;
END $$;

-- 2. Re-add constraint with 'prospect' included
ALTER TABLE contacts
ADD CONSTRAINT contacts_engagement_stage_check
CHECK (engagement_stage IN ('prospect', 'engaged', 'qualified', 'proposal', 'converted'));

-- 3. Add company_domain as a generated column (always derived from email, never stale)
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS company_domain TEXT
GENERATED ALWAYS AS (
  NULLIF(LOWER(SPLIT_PART(COALESCE(email, ''), '@', 2)), '')
) STORED;

-- 4. Backfill engagement_stage = 'prospect' for outbound-sourced contacts with no stage yet
UPDATE contacts
SET engagement_stage = 'prospect'
WHERE source = 'outbound'
  AND engagement_stage IS NULL;

-- Verify
SELECT
  engagement_stage,
  count(*) AS n
FROM contacts
GROUP BY engagement_stage
ORDER BY n DESC;
