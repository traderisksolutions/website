-- Email signatures for team members
CREATE TABLE IF NOT EXISTS public.user_signatures (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  title      TEXT,
  phone      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_full_access" ON public.user_signatures;
CREATE POLICY "service_full_access" ON public.user_signatures
  TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE TRIGGER set_updated_at
  BEFORE UPDATE ON public.user_signatures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
