-- Debit Note pipeline v2: multi-file bundles (2-3 source documents per renewal/new-business
-- event), commission extraction, Google Drive archival, OneDrive-sourced historical backfill.
-- Run in the Supabase SQL editor.

-- ── debit_note_bundles: parent record for one renewal/new-business event ───────────────────────
CREATE TABLE IF NOT EXISTS "public"."debit_note_bundles" (
    "id"                    "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status"                "text" DEFAULT 'pending'::"text" NOT NULL,
    "source"                "text" DEFAULT 'manual_upload'::"text" NOT NULL,
    "source_ref"            "text",
    "merged"                "jsonb",
    "consistency_warning"   "text",
    "suggested_company_id"  "uuid",
    "match_confidence"      numeric,
    "resolved_debit_note_id" "uuid",
    "created_at"            timestamp with time zone DEFAULT "now"(),
    "updated_at"            timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "debit_note_bundles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "debit_note_bundles_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'extracting'::"text", 'needs_review'::"text", 'error'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "debit_note_bundles_source_check" CHECK (("source" = ANY (ARRAY['manual_upload'::"text", 'onedrive'::"text"])))
);

ALTER TABLE "public"."debit_note_bundles" OWNER TO "postgres";

ALTER TABLE ONLY "public"."debit_note_bundles"
    ADD CONSTRAINT "debit_note_bundles_suggested_company_id_fkey" FOREIGN KEY ("suggested_company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_debit_note_bundles_status" ON "public"."debit_note_bundles" USING "btree" ("status");

ALTER TABLE "public"."debit_note_bundles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_debit_note_bundles" ON "public"."debit_note_bundles" USING (("auth"."role"() = 'authenticated'::"text"));

GRANT ALL ON TABLE "public"."debit_note_bundles" TO "anon";
GRANT ALL ON TABLE "public"."debit_note_bundles" TO "authenticated";
GRANT ALL ON TABLE "public"."debit_note_bundles" TO "service_role";

-- ── pdf_import_items: each row is now one file inside a bundle ─────────────────────────────────
ALTER TABLE "public"."pdf_import_items"
  ADD COLUMN IF NOT EXISTS "bundle_id" "uuid",
  ADD COLUMN IF NOT EXISTS "doc_type"  "text";

ALTER TABLE "public"."pdf_import_items"
  DROP CONSTRAINT IF EXISTS "pdf_import_items_doc_type_check";
ALTER TABLE "public"."pdf_import_items"
  ADD CONSTRAINT "pdf_import_items_doc_type_check" CHECK (("doc_type" IS NULL) OR ("doc_type" = ANY (ARRAY['client_invoice'::"text", 'commission_statement'::"text", 'trs_debit_note'::"text", 'other'::"text"])));

ALTER TABLE "public"."pdf_import_items"
  ADD CONSTRAINT "pdf_import_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."debit_note_bundles"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_pdf_import_items_bundle" ON "public"."pdf_import_items" USING "btree" ("bundle_id");

-- Now that pdf_import_items rows resolve into a debit_note via their bundle, resolve the FK the
-- other direction: debit_note_bundles.resolved_debit_note_id -> debit_notes(id).
ALTER TABLE ONLY "public"."debit_note_bundles"
    ADD CONSTRAINT "debit_note_bundles_resolved_debit_note_id_fkey" FOREIGN KEY ("resolved_debit_note_id") REFERENCES "public"."debit_notes"("id") ON DELETE SET NULL;

-- ── debit_notes: commission rate, Drive archival link, and the set of files available to send ──
ALTER TABLE "public"."debit_notes"
  ADD COLUMN IF NOT EXISTS "commission_rate"   numeric,
  ADD COLUMN IF NOT EXISTS "drive_folder_url"  "text",
  ADD COLUMN IF NOT EXISTS "attachment_files"  "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
  ADD COLUMN IF NOT EXISTS "bundle_id"         "uuid";

ALTER TABLE "public"."debit_notes"
  ADD CONSTRAINT "debit_notes_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."debit_note_bundles"("id") ON DELETE SET NULL;
