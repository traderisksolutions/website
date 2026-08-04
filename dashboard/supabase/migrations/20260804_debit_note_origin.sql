-- Tracks which upload flow created a debit note ("Generate new debit note" vs "Generate
-- Historical Debit Note") — both previously saved source='pdf_import' with no way to tell them
-- apart. Used to group the Google Drive archival structure (Root -> New|Historical -> Company ->
-- Policy) and available for future list/filter use.
-- Run in the Supabase SQL editor.

ALTER TABLE "public"."debit_notes"
  ADD COLUMN IF NOT EXISTS "origin" "text" DEFAULT 'new'::"text" NOT NULL;

ALTER TABLE "public"."debit_notes"
  DROP CONSTRAINT IF EXISTS "debit_notes_origin_check";
ALTER TABLE "public"."debit_notes"
  ADD CONSTRAINT "debit_notes_origin_check" CHECK (("origin" = ANY (ARRAY['new'::"text", 'historical'::"text"])));
