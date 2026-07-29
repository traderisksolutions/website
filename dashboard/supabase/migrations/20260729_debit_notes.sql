-- Debit Note tracking + Calendar (renewal dates) + PDF bulk-import staging.
-- Repurposes the existing (previously unused) companies/customers/policies tables as the
-- client/policy backbone; adds debit_notes as the billing/collection layer on top, and
-- pdf_import_items as a staging table for the AI-extraction review queue (same shape as the
-- gb_rate_tables extract_stage pattern). Run in the Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";

-- ── customers: company-only clients (most debit notes carry no contact email at all —
-- just a company name/address) can't satisfy a NOT NULL contact_id. This table has no rows
-- and no application code touches it yet, so loosening the constraint is safe.
ALTER TABLE "public"."customers" ALTER COLUMN "contact_id" DROP NOT NULL;

-- ── policies: fields the debit-note template needs that weren't modeled yet ──────────────────
ALTER TABLE "public"."policies"
  ADD COLUMN IF NOT EXISTS "broker"             "text",
  ADD COLUMN IF NOT EXISTS "currency"            "text" DEFAULT 'SGD'::"text",
  ADD COLUMN IF NOT EXISTS "class_of_insurance"  "text",
  ADD COLUMN IF NOT EXISTS "cover_note_no"       "text",
  ADD COLUMN IF NOT EXISTS "description"         "text",
  ADD COLUMN IF NOT EXISTS "source"              "text" DEFAULT 'manual'::"text";

ALTER TABLE "public"."policies"
  DROP CONSTRAINT IF EXISTS "policies_source_check";
ALTER TABLE "public"."policies"
  ADD CONSTRAINT "policies_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'pdf_import'::"text"])));

-- ── debit_notes ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."debit_notes" (
    "id"                  "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "policy_id"           "uuid" NOT NULL,
    "company_id"          "uuid" NOT NULL,
    "contact_id"          "uuid",
    "debit_note_no"       "text" NOT NULL,
    "issue_date"          "date" NOT NULL DEFAULT CURRENT_DATE,
    "payment_due_date"    "date",
    "currency"            "text" DEFAULT 'SGD'::"text" NOT NULL,
    "line_items"          "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "gst_amount"          numeric DEFAULT 0,
    "gross_amount"        numeric NOT NULL,
    "fee_rebate"          numeric DEFAULT 0,
    "net_amount"          numeric GENERATED ALWAYS AS (("gross_amount" - COALESCE("fee_rebate", 0))) STORED,
    "commission"          numeric,
    "paid_amount"         numeric DEFAULT 0,
    "paid_direct_amount"  numeric DEFAULT 0,
    "status"              "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "insurer"             "text",
    "pdf_storage_url"     "text",
    "source"              "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at"          timestamp with time zone DEFAULT "now"(),
    "updated_at"          timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "debit_notes_debit_note_no_key" UNIQUE ("debit_note_no"),
    CONSTRAINT "debit_notes_status_check" CHECK (("status" = ANY (ARRAY['unpaid'::"text", 'partially_paid'::"text", 'paid'::"text"]))),
    CONSTRAINT "debit_notes_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'pdf_import'::"text"])))
);

ALTER TABLE "public"."debit_notes" OWNER TO "postgres";

ALTER TABLE ONLY "public"."debit_notes"
    ADD CONSTRAINT "debit_notes_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."debit_notes"
    ADD CONSTRAINT "debit_notes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."debit_notes"
    ADD CONSTRAINT "debit_notes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_debit_notes_policy"  ON "public"."debit_notes" USING "btree" ("policy_id");
CREATE INDEX IF NOT EXISTS "idx_debit_notes_company" ON "public"."debit_notes" USING "btree" ("company_id");
CREATE INDEX IF NOT EXISTS "idx_debit_notes_issue"   ON "public"."debit_notes" USING "btree" ("issue_date");

ALTER TABLE "public"."debit_notes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_debit_notes" ON "public"."debit_notes" USING (("auth"."role"() = 'authenticated'::"text"));

GRANT ALL ON TABLE "public"."debit_notes" TO "anon";
GRANT ALL ON TABLE "public"."debit_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."debit_notes" TO "service_role";

-- ── pdf_import_items: bulk-upload staging / AI-extraction review queue ─────────────────────────
CREATE TABLE IF NOT EXISTS "public"."pdf_import_items" (
    "id"                    "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "storage_url"           "text" NOT NULL,
    "original_filename"     "text",
    "status"                "text" DEFAULT 'pending'::"text" NOT NULL,
    "extracted"             "jsonb",
    "suggested_company_id"  "uuid",
    "match_confidence"      numeric,
    "error_message"         "text",
    "resolved_debit_note_id" "uuid",
    "created_at"            timestamp with time zone DEFAULT "now"(),
    "updated_at"            timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pdf_import_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pdf_import_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'extracting'::"text", 'needs_review'::"text", 'error'::"text", 'approved'::"text", 'rejected'::"text"])))
);

ALTER TABLE "public"."pdf_import_items" OWNER TO "postgres";

ALTER TABLE ONLY "public"."pdf_import_items"
    ADD CONSTRAINT "pdf_import_items_suggested_company_id_fkey" FOREIGN KEY ("suggested_company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."pdf_import_items"
    ADD CONSTRAINT "pdf_import_items_resolved_debit_note_id_fkey" FOREIGN KEY ("resolved_debit_note_id") REFERENCES "public"."debit_notes"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_pdf_import_items_status" ON "public"."pdf_import_items" USING "btree" ("status");

ALTER TABLE "public"."pdf_import_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_pdf_import_items" ON "public"."pdf_import_items" USING (("auth"."role"() = 'authenticated'::"text"));

GRANT ALL ON TABLE "public"."pdf_import_items" TO "anon";
GRANT ALL ON TABLE "public"."pdf_import_items" TO "authenticated";
GRANT ALL ON TABLE "public"."pdf_import_items" TO "service_role";

-- ── fuzzy company-name matching (manual entry + PDF-import review suggestions) ─────────────────
-- NB: the live companies table's name column is actually "company_name", not "name" as
-- full_schema.sql's stale dump showed — confirmed via information_schema on 2026-07-29.
CREATE INDEX IF NOT EXISTS "idx_companies_name_trgm" ON "public"."companies" USING "gin" ("company_name" "extensions"."gin_trgm_ops");
