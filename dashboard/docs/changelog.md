# Changelog

Dated record of significant changes to the TRS dashboard, for documentation and accountability.

---

## 2026-09-11 (late) — Filing corrections after the migration

**Status:** `tsc` + `next build` clean, 333/333 tests pass. `20260911_company_identity.sql` applied. All corrections applied to live data.

With the alias table in place, the deterministic sweep now also keeps it current (`learnAliases`, no model calls) and 160 spellings are remembered. Running the whole thing against real mail surfaced four faults, all fixed with a regression test each.

### An insurer's address was outranking the client named in the subject

Mail like `(TRS) EQ - CIWE JIDP U2 Expansion PB` was filing under EQ, because the only address on the thread is the insurer's and the domain rule ran before the subject. The work is the client's. `resolveThread` now runs: the client's own domain, then a client named in the subject, then anything else. A new step re-examines threads already sitting on an insurer or partner and moves them to the client where the subject names one — **70 threads were corrected**, for example every `TRS (Liberty) : Renewal for Mister Mobile Trading` thread moving from Liberty to Mister Mobile.

### The insurer directory handed Allianz somebody else's domain

An Allianz contact row held a `@kyn.com.sg` address, so seeding gave Allianz the vendor's domain and three unrelated threads with it ("Welcome to Perplexity" among them). Seeded domains are now checked against the insurer's own name (`domainSuitsName`, which tolerates short names like AIA and QBE and looks past a subdomain). The domain was removed and the threads unfiled.

### TRS was given a company record of its own

`isInternal` only knew `trade-risksol.com`, so the unhyphenated `traderisksol.com` read as an outside organisation and became "Trade Risk Solutions Pte Ltd". Both spellings are now treated as ours, and the record was deleted.

### Healthway Medical Group was classified as a partner

Correct in general — it is a clinic group — but for TRS it is a client buying employee benefits, and the misclassification kept its threads stranded on AIA, QBE, Singlife and Great Eastern. Reclassified, which released 11 more threads to it. This one is a reminder that `kind` is a judgement the agent can get wrong; it is editable, and the filing screen is where it gets corrected.

### Where filing stands

| | |
|---|---|
| threads filed | 298 of 357 |
| contacts filed | 240 of 555 |
| companies | 108 (71 client, 29 insurer, 8 partner) |
| aliases remembered | 160 |

The 59 unfiled threads name organisations that are not companies yet (BruBru, Genscript, Talent Trader, Deluge). They sit in the domain queue on the Filing screen, which is the design: the agent creates what it is sure of and asks about the rest.

## 2026-09-11 (evening) — Automatic filing: every email gets a company

**Status:** `tsc` + `next build` clean, 325/325 tests pass (28 new). Applied to live data. **Migration `20260911_company_identity.sql` is PENDING** — everything works without it except remembering alternative spellings.

### The idea: decide per domain, not per email

Only 20% of threads had a company and every new email arrived unfiled, so the backlog grew daily. Filing each email individually does not scale. Behind the 307 unfiled threads sat just **75 email domains**, so the unit of decision is the domain: work out once who owns it, and every thread that domain ever touches files itself from then on. A new domain costs one cheap model call; a new email from a known domain costs nothing.

`src/lib/crm/autofile.ts` runs the pass, `POST /api/companies/autofile` exposes it (with `dryRun`), and the same resolver runs inside email ingest so new mail lands on its company on arrival.

### Counterparties are companies too

Insurers, administrators, brokers, adjusters and law firms now get company records of their own, marked `insurer` or `partner` and kept out of the client list. This is also what protects client records: once QBE owns `qbe.com`, no client can ever be given that domain by mistake. The 23 insurers in the directory are seeded automatically, which claims their domains before anything else is decided.

### Results on live data

| | before | after |
|---|---|---|
| threads with a company | 50 of 357 | 292 of 357 |
| contacts with a company | 31 of 555 | 160 of 555 |
| companies | 28 | 108 (69 client, 29 insurer, 10 partner) |

54 companies were created unattended, 18 domains were held back for a person to decide, and no client record holds an insurer domain.

### Keeping it clean at scale

The risk of automatic creation is a hundred near-duplicates. Three defences:

- **Identity matching** (`src/lib/crm/identity.ts`) folds legal suffixes, plurals and known aliases, so "Mister Mobile", "Mister Mobile Yishun" and "Mister Mobile Trading Pte Ltd" resolve to one company while "Fong Group 2023" and "Fong Seng Fast Food" stay apart. Plural folding was added after "Keller Foundation" nearly became a second Keller Foundations.
- **A confidence threshold.** Below it, nothing is created; the domain goes to the queue.
- **A merge tool.** `GET/POST /api/companies/merge` finds pairs that look like one organisation twice and folds one into the other, moving threads, contacts, debit notes, quotes and actions, and keeping the old spelling as an alias.

### Filing screen

`/companies/triage` is now **Filing**, in three parts: **Domains** (who is this, with the agent's reading and the closest companies already on file, answered by assigning, creating or ignoring), **Leftover threads** (personal mailboxes and mail about clients we have not met), and **Duplicates**.

### Two bugs found by dogfooding

1. **Deciding a domain filed nothing.** The thread list was gathered after the domain was claimed, and claiming is exactly what removes it from the unclaimed list, so the query always came back empty. Replaced with a direct `threadsOnDomain` query that does not care about claim status.
2. **Repeat spend on unresolvable threads.** Ingest runs on every message, so a thread that could not be placed would be re-classified on each new message forever. It is now recorded as considered on the first attempt; the free domain check still runs each time, so it files itself the moment its domain becomes known.

## 2026-09-11 (later) — Company oversight: deterministic filing, and the insurer-domain trap

**Status:** `tsc` + `next build` clean, 313/313 tests pass (17 new). Applied to live data. No migration.

### The problem

Only 20 of 357 threads and 11 of 555 contacts resolved to a company, and **every thread that arrived in the previous 24 hours came in unlinked**. Email ingest set a thread's company only from `contacts.company_id`, and almost no contact had one, so nothing ever filed itself and the backlog grew daily.

### Deterministic resolution (`src/lib/crm/resolve.ts`)

A thread is filed when one of these holds, in order of confidence: its contact already belongs to a company; a participant's email domain is one the company owns; or **the company's name appears in the subject line**. The third rule is what unlocks this dataset — staff put the client's name in nearly every subject, including on mail an insurer sends about that client, which is exactly where it belongs.

Once a thread is filed, the client-side domains on it are learned back onto the company, so the next email from that domain files itself. `POST /api/companies/resolve-all` runs the sweep and takes `dryRun`. The same resolver now runs inside email ingest, so new mail lands on its company on arrival instead of queueing for triage.

Applied to live data: threads 20 → 50, contacts 11 → 31, cases 1 → 3. The remaining 307 threads concern companies that do not exist in the CRM yet, which is the review queue's job by design.

### A bug caught in the dry run, before it wrote anything

Domain learning began claiming `libertyinsurance.com.sg`, `qbe.com`, `ihp.com.sg`, `aia.com.sg` and `mednefits.com` as *client* domains, which would have filed 58 threads under the wrong clients. Two causes:

1. `insurer_contacts.contact_email` was dropped when that table became a link into `contacts` (migration 20260707). The exclusion query read a column that no longer exists, `sbTry` swallowed the error, and the insurer exclusion list was silently empty. **Any read of a renamed column fails this quietly — worth auditing elsewhere.**
2. Excluding catalogued insurers was never sufficient on its own.

A domain must now clear three independent gates: seen on at least two of that company's threads, never seen on another company's threads (that pattern means a counterparty), and it must read like the company's own name. Short labels such as `qbe` or `aia` can never qualify. Nothing bad reached the database — the dry run caught it.

### Interface

Reviewed the real components at 390, 834 and 1440 px through a temporary local harness, since the app is behind Google sign-in. No horizontal overflow at any width, and the harness was removed afterwards.

One duplication survived the previous pass and is now gone: the Nexus summary listed "Open items" directly above the "To do" section showing the same work twice. The summary is narrative only — what is happening, who the stakeholders are, risks, upcoming. "To do" owns actionable items. "Where we left off" also showed a raw email address on one line and a short name on the next; both now read the same way.

### Email health

Newest inbound message 4.6 hours old, 16 to 30 inbound per weekday, 21 new messages and 10 new threads in 24 hours. Gmail ingest, threading, participants, attachments and AI drafts are all flowing. The Gmail credentials live only in the production environment, so the ingest fetch itself cannot be exercised locally.

## 2026-09-11 — Company workspace simplified, Pipeline becomes the sales journey

**Status:** `tsc` + `next build` clean, 297/297 unit tests pass, read and write paths dogfooded against the live database. No migration needed — this builds on `20260910_companies_crm.sql`, which is already applied.

Follow-up to the gut renovation below, after seeing it in use. The company page carried the same information twice (a nav tab and a side column), a five-box stat strip, and no single answer to "what is going on and where did we stop".

### Company page

- **One column, six tabs**: Overview · Threads · People · Policies · Quotation · Activity. The two-column layout and the duplicated side panels are gone, so nothing appears in more than one place.
- **No stat boxes.** The header is the name, a stage picker, the owner, the domains, and one plain status line, for example `SGD 659.20 overdue · policy ended 11 days ago`.
- **Overview** is now: **Needs attention** (a dot per item: overdue money, threads awaiting our reply, policies ending or already ended, agent proposals, a summary older than the newest email), then **Where we left off** (the last inbound message, our last reply, the last thing finished), then the **Nexus summary** with its stakeholders, then **To do**, then the five most recent threads.
- **Nexus summary** replaces the "company brief" framing: one read across every thread, refreshed by hand (Gemini Flash) with Opus behind an explicit Deep analysis. Manual only, by decision — an alert tells you when it has gone stale rather than spending tokens on its own.
- **Quotation** merges what used to be two places: quotes going out (RFQs, Pricing Matrix) and debit notes coming back, with the reminder drafting.
- **Nexus cases** left the company page and became a top-level nav item. Combining threads into a case still starts from the Threads tab.
- Flat surfaces throughout: sections are a small-caps heading over content, separated by a hairline. No rings, no nested cards.

### Pipeline

Now the journey, as four steps with counts: **Start › Sales › Convert › Operations**.

- **Start** holds every lead that is not a company yet, inbound and outbound in one list, with links out to the source tools (Website leads, WhatsApp, Lead Discovery, Signal Library, Lead Database). "Move to Sales" creates the company.
- **Sales** is companies being worked, with Campaigns and Reply Review to hand. **Convert** is quotes in the market. **Operations** is clients being serviced, showing money and renewals.
- **Apply N suggestions** moves every mis-staged company in a bucket at once, recomputed server-side and audit-logged per company (`POST /api/companies/apply-suggested-stages`, with a dry run).

### Navigation

`Home · Companies · Pipeline · Inbox · Nexus · Tools · RoadPlus · Analytics · Team · Settings`. Tools holds the global-only views (Debit Notes, Pricing Matrix, Calendar, Link threads, Contacts). Lead pages moved into Pipeline → Start. Every route still exists.

### Group Benefits deprecated

Pricing Matrix (22 Jul 2026) superseded Group Benefits (14 Jul 2026): Group Benefits extracts rates from an insurer's rate PDF, Pricing Matrix maps the insurer's own Excel calculator and runs its formulas, so no rate is ever re-typed. Group Benefits is off the menu; its route still works and its quotations appear in the Quotation tab labelled **Legacy**.

### Bug fixed: a client who pays on time could be marked lapsed

`suggestStage` treated only *unpaid* debit notes as evidence of being a client, so a company that settles every invoice and has no active policy row would be suggested as lapsed. It now counts billing history (paid or not) or an active policy as proof of a client, and requires genuine dormancy for lapsed — no active policy, nothing billed for about 18 months, and no recent conversation. Three regression tests cover it.

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
