-- Email evaluation pipeline: missing tables + ai_drafts fixes
-- Run in Supabase SQL editor

-- 1. Add email_type column to ai_drafts
--    Without this, every draft save fails (PostgREST rejects unknown columns),
--    draftId comes back null, and the evaluation compares a manual draft to itself.
ALTER TABLE ai_drafts ADD COLUMN IF NOT EXISTS email_type text;

-- 2. Allow 'superseded' status on ai_drafts
--    When a new draft is generated for a thread, old pending drafts are marked superseded.
--    The current CHECK constraint only allows pending/approved/rejected/sent, so that PATCH fails.
ALTER TABLE ai_drafts DROP CONSTRAINT IF EXISTS ai_drafts_status_check;
ALTER TABLE ai_drafts ADD CONSTRAINT ai_drafts_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'approved'::text, 'rejected'::text,
    'sent'::text, 'superseded'::text
  ]));

-- 3. Create draft_evaluations table
--    Stores one row per sent email: original AI draft vs what human actually sent,
--    Gemini's score (1-5), and structured analysis of what changed and why.
CREATE TABLE IF NOT EXISTS draft_evaluations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  draft_id    uuid,
  thread_id   uuid,
  email_type  text,
  ai_body     text,
  human_body  text,
  score       integer     CHECK (score >= 1 AND score <= 5),
  eval_json   jsonb
);

-- 4. Create prompt_examples table
--    Stores high-scoring (>=4) human-sent replies as few-shot examples.
--    The engagement draft API fetches the top 2 per email_type and injects them into every new draft.
CREATE TABLE IF NOT EXISTS prompt_examples (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  email_type      text        NOT NULL,
  context_summary text,
  ideal_reply     text        NOT NULL,
  score           integer     CHECK (score >= 1 AND score <= 5)
);
