-- Split payment tracking: a debit note's premium isn't always remitted in one lump sum — e.g. an
-- 80/20 split where the smaller share goes straight to TRS's own Ops account so it can pay out a
-- claim quickly, while the rest goes direct to the insurer. paid_amount/paid_direct_amount already
-- existed but shared a single `status`; this adds an independent status for the direct-to-insurer
-- leg, plus two tag checkboxes recording which channel(s) finance says apply to this debit note.
-- Run in the Supabase SQL editor.

ALTER TABLE "public"."debit_notes"
  ADD COLUMN IF NOT EXISTS "paid_direct_status"     "text" DEFAULT 'unpaid'::"text" NOT NULL,
  ADD COLUMN IF NOT EXISTS "pay_direct_to_insurer"   boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "pay_to_trs_ops"          boolean DEFAULT false NOT NULL;

ALTER TABLE "public"."debit_notes"
  DROP CONSTRAINT IF EXISTS "debit_notes_paid_direct_status_check";
ALTER TABLE "public"."debit_notes"
  ADD CONSTRAINT "debit_notes_paid_direct_status_check" CHECK (("paid_direct_status" = ANY (ARRAY['unpaid'::"text", 'partially_paid'::"text", 'paid'::"text"])));

-- `status` already tracks the TRS-Ops-account leg (paid_amount) — no rename needed, just
-- read/write it under that narrower meaning from here on.
