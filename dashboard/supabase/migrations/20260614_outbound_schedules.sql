-- Creates outbound_schedules if it does not exist yet, and ensures the new
-- column schema (sector / locations / headcount_ranges / product_type) is
-- present regardless of whether the table was previously created manually.

CREATE TABLE IF NOT EXISTS public.outbound_schedules (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sector           text        NOT NULL DEFAULT '',
  locations        text[]      NOT NULL DEFAULT '{"Singapore"}',
  headcount_ranges text[]      NOT NULL DEFAULT '{}',
  product_type     text        NOT NULL DEFAULT 'General',
  frequency        text        NOT NULL DEFAULT 'daily',
  is_active        boolean     NOT NULL DEFAULT true,
  next_run_at      timestamptz NOT NULL DEFAULT now() + interval '1 day',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Add new columns for tables created under the old schema (query/roles/max_companies).
-- Each is idempotent via IF NOT EXISTS.
ALTER TABLE public.outbound_schedules
  ADD COLUMN IF NOT EXISTS sector           text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS locations        text[]      NOT NULL DEFAULT '{"Singapore"}',
  ADD COLUMN IF NOT EXISTS headcount_ranges text[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS product_type     text        NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS frequency        text        NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS is_active        boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS next_run_at      timestamptz NOT NULL DEFAULT now() + interval '1 day';

-- Migrate any rows that used the old "query" column into sector.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'outbound_schedules'
      AND column_name  = 'query'
  ) THEN
    UPDATE public.outbound_schedules
    SET sector = query
    WHERE sector = '' AND query IS NOT NULL AND query <> '';
  END IF;
END $$;

-- RLS: service-role key bypasses RLS, but enable it for completeness.
ALTER TABLE public.outbound_schedules ENABLE ROW LEVEL SECURITY;
