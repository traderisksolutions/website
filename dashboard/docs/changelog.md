# Changelog

Dated record of significant changes to the TRS dashboard, for documentation and accountability.

---

## 2026-07-06 — RFQ Engagement Agent + Nexus analysis rewire + engagement UX

**Author:** developer@trade-risksol.com  ·  **Status:** code-complete, tsc + `next build` clean, 52/52 unit tests pass. Runtime read-paths verified against live Supabase. Auth'd/send flows are prod-configured but not yet exercised end-to-end (need a staging run with a live thread).

### 1. RFQ Engagement Agent (detect → route to insurers → track in Nexus)

Turns an inbound client email requesting quotes into a fan-out to insurers, tracked as a Nexus case.

- **Phase A — Insurer directory** (`migrations/20260706_insurer_directory.sql`): `insurers` + `insurer_contacts` (insurer × product line → point person). Shared taxonomy in `src/lib/product-lines.ts` (12 lines). CRUD API `api/settings/insurers[/contacts]`; editable via the Settings page (`InsurerDirectoryPanel`).
  - *Decision:* directory is editable by any authenticated employee (not admin-only), per user.
- **Phase B — Detection + reply UX** (`migrations/20260706_rfq_pipeline.sql`): `rfq_requests` + `rfq_dispatches`. `api/nexus/rfq/detect` (Gemini 2.5-flash, fired from `api/email/ingest`) classifies RFQs and extracts one request line per product line, opens ONE Nexus case, links the client thread. New **RFQ tab** in the Nexus case (`RfqPanel`): per line, the employee picks insurers, a personalized draft is generated (`api/nexus/rfq/draft`), reviewed with a per-user "From" address, and sent individually.
  - *Decisions:* review-&-approve each email (no auto-send); employee picks insurers manually; one case per client RFQ; sender configurable per user.
- **Phase C — Routing + reply loop** (`migrations/20260706_rfq_phase_c.sql`): correlation on the Gmail thread id. `api/email/send` returns `gmailThreadId`; stored on the dispatch. Ingest hook `linkRfqDispatch` links each insurer thread to the case as `party_type='insurer'` and flags replies — order-independent (sent copy or reply, whichever ingests first).

### 2. Manual "Start RFQ" trigger

Escape hatch when auto-detection misses an RFQ. `api/nexus/rfq/start` (suggest mode = Gemini pre-fill, create mode = open case + lines; no confidence gate). Apple frosted-glass `StartRfqModal` opened from a **Start RFQ** button in the engagement thread header; routes to the new case via `/nexus?case=<id>` deep-link.

### 3. Nexus Grand Analysis — model split (Gemini → Opus → Gemini)

`src/lib/run-nexus-analysis.ts` re-cut into 3 passes: Gemini 2.5 Pro (extraction) → **Claude Opus `claude-opus-4-8` (Grand Analysis: scenarios, next steps, reserve, + per-email communication briefs)** → Gemini 2.5 Flash (`draftEmailsFromBriefs` writes the email bodies from Opus's briefs). Opus uses adaptive thinking; parses the text content block.
  - *Decision:* Opus is **required** for the strategy layer — no silent Gemini fallback. Until `ANTHROPIC_API_KEY` is set, strategy + drafting are skipped and `strategy_model='not_configured'` (extraction still runs). User to add the key.

### 4. Engagement agent rewiring (surgical)

- Removed the 30s auto-refresh interval **and** the Realtime subscription that caused the thread area to blink (`engagement/page.tsx`). New mail appears via manual Refresh + the 90s background Gmail sync.
- **AI Analysis is now button-only:** removed the ingest → `auto-summarize` trigger and the client auto-poll; the Refresh button generates on demand (`refresh-summary`) then reloads.
- **Reply is now button-only:** removed the auto reply-draft fetch on thread open; the existing Generate/Regenerate button is the only path.

### 5. Gap features

- **Audit trail:** `logActivity` on all insurer/contact create·update·delete and every RFQ dispatch (`audit_logs`).
- **Attachments to insurers:** `api/email/send` now builds `multipart/mixed` with files downloaded from Supabase Storage; `api/nexus/rfq/attachments` lists the client thread's stored files; the insurer draft composer shows a pick-list (unticked by default). Auto-storage on receive unchanged.
- **Quote comparison:** `api/nexus/rfq/quotes` (Gemini extracts premium/excess/terms/validity from each replied insurer); side-by-side table in `RfqPanel` once any insurer replies.
- **SLA reminders (manual):** dispatch chips show a `⏳Nd` waiting badge (amber ≥3 days) with a **Chase** button → `api/nexus/rfq/chase` sends an AI follow-up on the original thread. No auto-chase.

### Migrations to apply (Supabase SQL editor)
`20260706_insurer_directory.sql`, `20260706_rfq_pipeline.sql`, `20260706_rfq_phase_c.sql`. (No new migration for the engagement rewire or gap features.)

### Config dependencies
`ANTHROPIC_API_KEY` (Opus analysis — pending), `GEMINI_API_KEY_EMAIL_ANALYSIS` and `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` (present in `.env.prod`; absent from local `.env.local`, so auth'd/analysis routes 500 only in local dev).

### Outstanding
End-to-end behavioral test in staging: RFQ send with real attachments, insurer reply → thread linking → quote extraction, and the manual Chase send.
