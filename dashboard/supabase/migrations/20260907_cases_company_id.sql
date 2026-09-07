-- Companies-as-hub Phase 2 — direct company_id on cases (Nexus). Run in the Supabase SQL editor.
--
-- cases has zero company signal today — not even indirectly. Its only path to a company is
-- case_threads -> email_threads.company_id (added in Phase 1, see 20260907_email_threads_company_id.sql).
-- This adds the same direct, nullable, additive FK cases gets going forward: both case-creation
-- routes (manual + RFQ auto-creation) now resolve a company via resolveCompany
-- (src/lib/debit-note-commit.ts) at write time, so new cases are never actually unresolved.
-- Existing rows get a best-effort backfill from their earliest-linked thread's company below;
-- a case with no linked thread, or whose thread never resolved a company, stays NULL — visible
-- only via /nexus directly until fixed manually. No bulk triage UI for old data in this phase.

ALTER TABLE "public"."cases"
  ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "cases_company_id_idx"
  ON "public"."cases"("company_id") WHERE "company_id" IS NOT NULL;

-- Backfill: each case's earliest-linked thread's company.
UPDATE "public"."cases" c
SET    "company_id" = sub."company_id"
FROM (
  SELECT DISTINCT ON (ct."case_id") ct."case_id", et."company_id"
  FROM   "public"."case_threads" ct
  JOIN   "public"."email_threads" et ON et."id" = ct."thread_id"
  WHERE  et."company_id" IS NOT NULL
  ORDER  BY ct."case_id", ct."created_at" ASC
) sub
WHERE c."id" = sub."case_id" AND c."company_id" IS NULL;
