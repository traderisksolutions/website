-- Companies-as-hub Phase 1 — direct company_id on email_threads. Run in the Supabase SQL editor.
--
-- Today a thread's company is only reachable indirectly: contact_id -> contacts.company_id
-- (added 20260819, not backfilled for contacts linked before that date) -> or, for older
-- contacts, the company_contacts junction (see resolveCompanyId in src/lib/customer-profile.ts).
-- debit_notes got the same direct FK for the same reason (20260729_debit_notes.sql) — walking
-- the indirection on every page load doesn't scale to a company-scoped Threads tab or an
-- Engagement "group by company" filter. This adds the same direct, nullable, additive FK to
-- email_threads, backfilled below using exactly resolveCompanyId's precedence so this column
-- and that function never disagree for a given contact. Threads with no contact_id, or a
-- contact_id whose company never resolved, stay NULL — surfaced by Engagement's "Unlinked" tab
-- for manual linking. contact_id / company_contacts are untouched; this is purely additive.

ALTER TABLE "public"."email_threads"
  ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "email_threads_company_id_idx"
  ON "public"."email_threads"("company_id") WHERE "company_id" IS NOT NULL;

-- ── Backfill, same precedence as resolveCompanyId (src/lib/customer-profile.ts) ───────────────
-- 1) Direct: contacts.company_id
UPDATE "public"."email_threads" et
SET    "company_id" = c."company_id"
FROM   "public"."contacts" c
WHERE  et."contact_id" = c."id"
  AND  c."company_id" IS NOT NULL
  AND  et."company_id" IS NULL;

-- 2) Fallback: company_contacts junction (pre-20260819 contacts only ever got this link)
UPDATE "public"."email_threads" et
SET    "company_id" = cc."company_id"
FROM   "public"."contacts" c
JOIN   "public"."company_contacts" cc ON cc."contact_id" = c."id"
WHERE  et."contact_id" = c."id"
  AND  et."company_id" IS NULL;
