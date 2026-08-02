-- Mid-term endorsements (e.g. adding an employee to a group policy partway through its term)
-- bill the client with the SAME policy period shown on the debit note as the master policy's
-- full term — which reads as a data error next to a payment due date near the end of that term
-- unless the debit note itself says "this is a mid-term change, effective X". Adds an event type
-- (new business / renewal / endorsement) and, for endorsements, the actual effective date of the
-- change — distinct from the policy's own period_start/period_end, which stays as the master term.
-- Run in the Supabase SQL editor.

ALTER TABLE "public"."debit_notes"
  ADD COLUMN IF NOT EXISTS "event_type"                   "text" DEFAULT 'new_business'::"text" NOT NULL,
  ADD COLUMN IF NOT EXISTS "endorsement_effective_date"    "date";

ALTER TABLE "public"."debit_notes"
  DROP CONSTRAINT IF EXISTS "debit_notes_event_type_check";
ALTER TABLE "public"."debit_notes"
  ADD CONSTRAINT "debit_notes_event_type_check" CHECK (("event_type" = ANY (ARRAY['new_business'::"text", 'renewal'::"text", 'endorsement'::"text"])));
