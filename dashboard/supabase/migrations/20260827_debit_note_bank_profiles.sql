-- Per-currency bank/payment details for the debit note PDF footer, staff-editable without a code
-- deploy. USD debit notes need a correspondent/agent bank for wire transfer that SGD (local
-- DBS + PayNow) doesn't; previously this was a single hardcoded block in debit-note-pdf.tsx.
-- profile_key is looked up against debit_notes.currency; any currency without its own row
-- (MYR, IDR, ...) falls back to the is_default row (SGD). Run in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS "public"."debit_note_bank_profiles" (
    "id"                    "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_key"           "text" NOT NULL,
    "bank_name"             "text" NOT NULL,
    "bank_account_name"     "text" NOT NULL,
    "bank_account_number"   "text" NOT NULL,
    "bank_code"             "text",
    "branch_code"           "text",
    "swift_code"            "text",
    "pay_now_uen"           "text",
    "agent_bank_swift_bic"  "text",
    "agent_bank_name"       "text",
    "is_default"            boolean DEFAULT false NOT NULL,
    "created_at"            timestamp with time zone DEFAULT "now"(),
    "updated_at"            timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "debit_note_bank_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "debit_note_bank_profiles_profile_key_key" UNIQUE ("profile_key")
);

ALTER TABLE "public"."debit_note_bank_profiles" OWNER TO "postgres";

ALTER TABLE "public"."debit_note_bank_profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_debit_note_bank_profiles" ON "public"."debit_note_bank_profiles" USING (("auth"."role"() = 'authenticated'::"text"));

GRANT ALL ON TABLE "public"."debit_note_bank_profiles" TO "anon";
GRANT ALL ON TABLE "public"."debit_note_bank_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."debit_note_bank_profiles" TO "service_role";

INSERT INTO "public"."debit_note_bank_profiles"
  ("profile_key", "bank_name", "bank_account_name", "bank_account_number", "bank_code", "branch_code", "swift_code", "pay_now_uen", "is_default")
VALUES
  ('SGD', 'DBS Bank', 'Trade Risk Solutions Pte. Ltd.', '072-928492-0', '7171', '072', 'DBSSGSG', '202022795HSGD', true)
ON CONFLICT ("profile_key") DO NOTHING;

INSERT INTO "public"."debit_note_bank_profiles"
  ("profile_key", "bank_name", "bank_account_name", "bank_account_number", "bank_code", "branch_code", "swift_code", "agent_bank_swift_bic", "agent_bank_name", "is_default")
VALUES
  ('USD', 'DBS Bank', 'Trade Risk Solutions Pte. Ltd.', '072-928492-0', '7171', '072', 'DBSSSGSGXXX', 'CHASUS33', 'JPMorgan Chase Bank, N.A.', false)
ON CONFLICT ("profile_key") DO NOTHING;
