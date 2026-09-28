-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- The company board, stakeholder titles, and confirmed companies.
--
-- 1. board_tasks / board_comments — the fortnightly printed list, as one shared live board.
--    Every client company is a row on the board by right; a task is a "pressing item" on
--    that company. Each task has one primary owner, any number of collaborators, a deadline,
--    a priority and a status. Anyone can add, assign, complete or comment. Every change is
--    written to audit_logs so there is a record of who did what, and realtime is switched on
--    so two people editing at once see each other, the way a shared sheet does.
--
-- 2. contacts.title / signature_read_at — a person's position, read once from their email
--    signature the first time they appear, so the People tab can show who is who.
--
-- 3. companies.confirmed_at / confirmed_by — every unknown business domain now becomes a
--    company on arrival, so nothing waits in a queue. These mark that a human has looked at
--    the record; until then the page shows it as unconfirmed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Company board ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title            text NOT NULL,
  note             text,
  due_on           date,
  status           text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'awaiting_reply', 'blocked', 'complete')),
  priority         text NOT NULL DEFAULT 'medium'
                   CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  primary_assignee text,                                   -- staff email
  collaborators    text[] NOT NULL DEFAULT '{}',           -- staff emails
  created_by       text,
  completed_at     timestamptz,
  completed_by     text,
  position         integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.board_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES public.board_tasks(id) ON DELETE CASCADE,
  author     text,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_tasks_company_idx  ON public.board_tasks (company_id, position);
CREATE INDEX IF NOT EXISTS board_tasks_open_idx     ON public.board_tasks (due_on) WHERE status <> 'complete';
CREATE INDEX IF NOT EXISTS board_tasks_owner_idx    ON public.board_tasks (primary_assignee) WHERE status <> 'complete';
CREATE INDEX IF NOT EXISTS board_comments_task_idx  ON public.board_comments (task_id, created_at);

CREATE OR REPLACE FUNCTION public.touch_board_task()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_board_tasks_touch ON public.board_tasks;
CREATE TRIGGER trg_board_tasks_touch BEFORE UPDATE ON public.board_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_board_task();

ALTER TABLE public.board_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_board_tasks    ON public.board_tasks;
DROP POLICY IF EXISTS staff_board_comments ON public.board_comments;
CREATE POLICY staff_board_tasks    ON public.board_tasks    USING (auth.role() = 'authenticated');
CREATE POLICY staff_board_comments ON public.board_comments USING (auth.role() = 'authenticated');

GRANT ALL ON TABLE public.board_tasks    TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.board_comments TO anon, authenticated, service_role;

-- Live updates between people looking at the board at the same time.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'board_tasks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.board_tasks;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'board_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.board_comments;
  END IF;
END $$;

-- ── 2. Stakeholder titles ───────────────────────────────────────────────────────────────────
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS title             text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS signature_read_at timestamptz;

-- ── 3. Confirmed companies ──────────────────────────────────────────────────────────────────
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS confirmed_by text;

-- Everything that exists today was either made by a person or has been looked at since, so
-- treat it as confirmed. Only companies created from here on start unconfirmed.
UPDATE public.companies SET confirmed_at = COALESCE(confirmed_at, created_at) WHERE confirmed_at IS NULL;

-- ── 4. Home pins ─────────────────────────────────────────────────────────────────────────────
-- Home lists the companies a person has pinned to work on; to-dos alone do not put one there.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS home_pinned_at timestamptz;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS home_pinned_by text;
CREATE INDEX IF NOT EXISTS companies_home_pinned_idx ON public.companies(home_pinned_at) WHERE home_pinned_at IS NOT NULL;

COMMENT ON TABLE public.board_tasks    IS 'Pressing items on a client company: one primary owner, collaborators, deadline, priority, status.';
COMMENT ON TABLE public.board_comments IS 'Threaded updates on a board task.';
