-- Save-as-draft for the threadless "new email" composer (NewEmailComposeModal) — extends the
-- existing ai_drafts table rather than forking a new one. thread_id/contact_id are already
-- nullable and already exercised with null for threadless Nexus drafts (see
-- src/app/api/nexus/draft-create/route.ts); this just adds the two columns a "new compose" draft
-- needs that a reply-draft doesn't (subject, cc — the recipient's To is already carried on the
-- thread/contact for a reply, but a threadless draft has no thread to read it from), plus a
-- 'draft' status meaning "saved, not yet sent" (distinct from 'pending' = AI-generated awaiting
-- human review on an existing thread).
-- Run in the Supabase SQL editor.

ALTER TABLE ai_drafts ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE ai_drafts ADD COLUMN IF NOT EXISTS cc      jsonb;
ALTER TABLE ai_drafts ADD COLUMN IF NOT EXISTS to_email text;

ALTER TABLE ai_drafts DROP CONSTRAINT IF EXISTS ai_drafts_status_check;
ALTER TABLE ai_drafts ADD CONSTRAINT ai_drafts_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'approved'::text, 'rejected'::text,
    'sent'::text, 'superseded'::text, 'draft'::text
  ]));
