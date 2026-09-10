# Changelog

Dated record of significant changes to the TRS dashboard, for documentation and accountability.

---

## 2026-09-10 — Companies-first CRM (gut renovation)

**Status:** code-complete, `tsc` + `next build` clean, 294/294 unit tests pass. Read paths dogfooded locally against the live database. **Migration `supabase/migrations/20260910_companies_crm.sql` must be run in the Supabase SQL editor** — it also re-applies `20260901_ai_drafts_context_used.sql` and `20260907_cases_company_id.sql`, which had not reached the hosted database. Every new read is migration-lag safe (`select=*`, `sbTry`), so the pages work before the SQL runs; actions, link suggestions and saved briefs need the new tables.

### What changed

The client company is now the hub. Threads, debit notes, quotes (RFQ + pricing matrix + group benefits), Nexus cases, contacts and AI live on the company page instead of in separate silos.

- **Navigation** (`src/components/nav/nav-sections.tsx`): Home · Companies · Pipeline · Inbox · Work (client tools + lead sources) · RoadPlus · Analytics · Team · Settings. No route was deleted.
- **Home** (`/`): what needs attention today across every client — emails awaiting our reply, overdue and due-soon debit notes, renewals in 60 days, actions due, agent proposals to review, threads still to link.
- **Companies** (`/companies`): list with roll-ups (awaiting reply, outstanding / overdue by currency, next renewal, open actions, last activity), stage filter, search, new-company dialog. Cards on phones, table on tablet and up.
- **Company workspace** (`/companies/[id]`, tabs via `?tab=`): header with stage select, owner, domains and five KPIs; Overview (AI brief, next actions, threads, people, payments, quotes, cases, timeline); Threads (filter by reply state / category, tick to combine into a Nexus case); People (ranked by correspondence, point person = most active client contact, add observed domains); Quotes; Payments (derived overdue, totals, one-click reminder draft into the Engagement composer); Cases; Actions; Activity; Policies.
- **Pipeline** (`/pipeline`): kanban of companies by stage (drag or select), with a "New leads" column that converts inbound leads into companies.
- **Link threads** (`/companies/triage`): exact-match linking (contact → company, or email domain), then agent suggestions (existing / new / not a client) reviewed by staff. Nothing is linked or created from an AI suggestion without a click.
- **Company agent**: brief (Gemini Flash; Opus behind "Deep analysis"), next-action extraction into `company_actions` as proposals, triage suggestions, and the Opus chat dock re-scoped from case-only to case-or-company (`/api/chat` accepts `company_id` with company read-tools).
- **Data model**: `companies.kind/stage/stage_changed_at/owner_email/domains/source/ai_brief*`, new `company_actions` and `company_link_suggestions`, `chat_threads.company_id`, plus backfill of `email_threads.company_id` / `contacts.company_id` by contact link and domain.
- **Library**: `src/lib/crm/*` is the single vocabulary — aggregates, people ranking, payment maths, unified quotes, cases, threads, activity timeline, prompt context, brief, actions, triage, reminder, stage rules.

### Decisions (asked and answered on 10 Sep)

Companies-first including Leads, Pipeline and Group Benefits; RoadPlus, Analytics, KYN ROI and Team stay separate. The CRM lists clients only; insurers stay in the Settings directory. Point persons are derived from correspondence, not assigned. One lifecycle stage per company. Overdue is computed; reminders are drafted, never auto-sent. Backfill is exact-match automatic, AI-suggested with review. Gemini Flash by default, Opus for deep analysis and chat.

### Not done / known limits

- Opus paths (deep brief, company chat) were not exercised locally — no `ANTHROPIC_API_KEY` in `.env.local`.
- `GET /api/companies/[id]` keeps the old `contacts` (junction) and `debitNotes` fields for `CompanyContactPicker` and the legacy Contacts → Companies tab; the workspace uses `contactList` and `payments`.
- The "Not a client" triage decision hides a thread from the queue; it does not tag the sender as an insurer or partner company (insurers remain in the Settings directory by decision).

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
