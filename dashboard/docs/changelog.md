# Changelog

Dated record of significant changes to the TRS dashboard, for documentation and accountability.

---

## 2026-09-30 — PRODUCTION IS BLANK: the API gate is enforcing with no keys

trs-dashboard-pi.vercel.app answers every `/api/**` call with
`401 {"error":"Missing x-api-key header.","code":"missing_key"}`, so every page renders empty
(0 conversations, 0 companies). The data is intact. Cause: the gate defaults to `enforce`
(`src/lib/api-gate/runtime.ts`), `WEB_API_KEY` is not set on Vercel so the boot script attaches
no header, and `api_clients` has no rows.

Fix, in order (the deploying account):
1. Immediate: set `API_GATE_MODE=log-only` on Vercel and redeploy. Pages come back at once.
2. Proper: with `SUPABASE_SERVICE_KEY` in the shell, from the dashboard folder run
   `node scripts/api-key.mjs issue dashboard browser web` and
   `node scripts/api-key.mjs issue internal machine machine`. Each prints its key once.
   Put the first in Vercel as `WEB_API_KEY` and the second as `INTERNAL_API_KEY`, redeploy,
   then remove `API_GATE_MODE` so the gate enforces.

---

## 2026-09-30 (night, later) — A company can have one or many owners

- **SQL to run:** `supabase/migrations/20260930_company_owners.sql` adds `companies.owner_emails
  text[]` (default empty), backfills it from `owner_email`, and indexes it. `owner_email` stays
  and always mirrors the first entry, so every existing read (inbox filing, triage, briefs, the
  Unassigned views, the conversations API) keeps working. Until the SQL runs, the PATCH falls
  back to writing only the first owner.
- `PATCH /api/companies/[id]` takes `owner_emails: string[]` (a lone `owner_email` still sets
  the list). The edit-company dialog only sends the owner when it was changed, so it cannot
  wipe co-owners.
- `OwnerPicker` (badge per owner with a remove, "Add person" select from the team, "No owner"
  when empty) replaces the single select on the company page header and in the company panel.
- Companies table shows every owner; sort by owner uses the first. Home cards show every
  owner. "My clients", the owner filter, search, Unassigned, the no-owner badge and the
  attention rule all read the list.

---

## 2026-09-30 (night) — Home trimmed; owner is chosen, not defaulted; drawer under the navbar

- Home: the Add company button is gone (it lives on Companies) and the Pinned | Unassigned
  switch is gone. Home is the pinned companies again. The Unassigned views stay in All Inbox
  and on Companies.
- Owner: a person picker on the company page header and in the company panel (the team roster
  from `/api/users`, "No owner" first). `PATCH /api/companies/[id] { owner_email }` already
  existed. Nothing defaults an owner in code; the 34 clients showing Nathan carry that value in
  the database from an earlier import, and each can now be changed or cleared in place.
- Company panel: it sat under the 56px navbar (`inset-y-0`), so its header was hidden; it now
  starts at 56px. Its Policies, Threads and Finance lists are registers.

---

## 2026-09-30 (later) — Endorsements follow the main policy; Unassigned views; Overview on the register

### 1. A mid-term endorsement is an amendment to the main policy
Rule: an endorsement debit note bills the change; the cover, the term and the renewal date stay
those of the main policy. It never becomes a second active policy.
- `src/lib/policies/endorsement.ts`: `basePolicyNumber` (strips "/E01", "-E001", "-T00004"
  member tags), `looksLikeEndorsement` (suffix or wording), `findMasterPolicy` (same base
  number, else the one master with the same term end and class, never a guess between two),
  `withoutEndorsementDuplicates`. Unit-tested against the live shapes.
- Approval (`debit-note-commit.ts`): `eventType = endorsement` attaches the debit note to the
  master policy found for that customer; a same-number re-import no longer overwrites the
  master's description and term with the amendment's.
- `/api/policies/lookup` also takes `company_id`, `class_of_insurance`, `period_end` and returns
  the master with `matchedBy: number | base | term`. Both review pages show "Amendment to policy
  X · renews DATE. This debit note attaches to that policy and keeps its renewal date." and send
  `{ policyId }` for that master.
- Counts and Calendar (`aggregates.ts`, `overview.ts`, `calendar/events`) drop endorsement
  rows that duplicate a master's term, so each cover renews once. Purchase history labels such
  rows "Amendment to <number>" with the renewal "Follows the main policy".
- **One-off repair, run in the SQL editor:** `supabase/migrations/20260930_endorsement_policies.sql`
  repoints the existing endorsement debit notes to their master policy and removes the six
  duplicate policy rows (HFW-E001 ×2, /R00/E01, N0018530, N0018676-T…, N0018913). It only acts
  where exactly one master is found.

### 2. Unassigned
- All Inbox: a work view "Unassigned" = threads filed under a company that has no owner
  (`companyOwner` now comes from the conversations API). Unlinked stays separate.
- Companies: quick view "Unassigned" = companies with no owner.
- Home: a Pinned | Unassigned switch under the search. Unassigned = a company nobody owns that
  has an email waiting for a reply or open to-dos, or any company with an open to-do that has
  no person on it.

### 3. Overview on the register
Open items (Item · Detail · When), Where we left off (Event · Who · When) and Activity (What ·
Kind · When) now render through the shared register; rows open what they name.

---

## 2026-09-30 — All Inbox rebuilt as the Mail Workspace

**Status:** `tsc` clean, `next build` clean, vitest 365/365 (46 files). Built to the approved mock
(https://claude.ai/code/artifact/f1d89dcd-3069-48ef-a74a-61ffd7e8b1a0). Nothing deployed.

### Navigator
`ThreadListPane` is the unified Mail Navigator: "All Inbox" (a button that selects everything) with
the count, an ink Compose, one search (⌘K / Ctrl+K / `/` focus it), the work views in two quiet
columns with counts (Needs reply, Awaiting client, Unlinked, Drafts | Renewals, Claims, RFQs,
Clients, Prospects), then the rows: ink dot when a reply is needed, sender and time, company ·
subject, the state in words. Footer: "Newest activity first", density, sync, collapse. Collapsed
= a 64px icon rail with counts (`CollapsedNavRail`, persisted as `engagement_nav_collapsed`;
`--engagement-rail-w` follows). Default width 380, range 320–460. `c` opens Compose when no field
is focused. The phone fallback renders the same navigator inline.

### Reader
`ThreadHeader`: subject 22px, contact · email, one context line (company link or "Not linked to a
company · Link company", type, state, owner), Reply in ink, Reply all / Context / More as icon
buttons. `ThreadView`: the latest message in full on a 1040px measure, earlier messages as one-line
rows that open in place, the collapsed "Reply to X…" field at the foot (`r` opens it), the context
rail as a 340px column from 1024px and a sheet below, closed by default.
`MessageBlock`: avatar, name (the thread contact's name when the header carries only an address),
to-line with Details, timestamp; body through sanitise → blank-block collapse → quoted split →
signature split → table wrap, typeset by `.email-html-body`; data tables in a rounded scroll
container with "Table kept exactly as sent · View original table"; signature folded at 13.5px;
quoted history behind one grey fold row and rendered as a nested chain (`splitQuotedChain`,
Gmail / Outlook / Apple / plain-text markers, deepest last); "View original" opens the raw HTML or
plain text in a dialog; attachments as document cards with Preview and Download.
`ContextRail`: cards on the soft fields — Company (blue), Work (butter), Policy (lavender),
Calendar (mint), Finance (peach), Related threads (grey), TRS assist as text links (Summarise ·
Draft reply · Create to-do · Show analysis), Nexus; the contact / status / notes panel outlined.

### Composer
`EngagementComposePanel` presentation rebuilt on the same measure: Reply · Minimise, To with chips
+ Reply all + Cc/Bcc, Subject with From and Signature as quiet inline selects, the grouped
toolbar from the new `compose-toolbar.tsx` (paragraph · B I U S colour · font size · lists indent
align quote · link table image divider · Attach Assist · undo redo clear full-screen), the Quill
editor at 16px, Approve & Send in ink. `RichEditor` (Quill 2 + quill-table-better) gained the
grouped toolbar and extra formats (font family, size, alignment registered as a real format,
divider, ⌘K link) while keeping its API for the campaign pages. `NewEmailComposeModal` is the
"New email" dialog (880px, chips, Cc, From, the same toolbar, Save draft · Send, external-recipient
note). No navy remains in the inbox; every hairline is #e8eaed.

Legacy panels still rendered by the company page (`CompanyMail`) and the RFQ workflow moved onto
the same tokens: `ThreadRfqWorkflow` (numbered underline steps, outlined chips, one ink button),
`engagement-message-card`, `engagement-thread-row`, `engagement-thread-header`,
`ai-analysis-panel`, `evaluation-summary`, `email-type-badge`, `draft-provenance-panel`,
`engagement-status-badge`.

### Judgement calls
- Forward, Send later, Preview, Template and "Extract policy details" are not shown: no handler or
  API exists for them. Nothing was invented.
- Attachment Preview and Download both use `/api/engagement/attachments/[id]/download` (there is
  no preview route); PDFs and images open inline in the new tab.
- The reply panel has no autosave (drafts are written on send), so it shows no "Saved" state; the
  New email dialog shows its real draft state.
- Esc closes menus and full screen, not the reply panel, because minimising discards the draft.
- The previous session's capture caveat holds: with the cron bearer, session-only routes return
  401, so some screens look empty in the walkthrough shots.

---

## 2026-09-29 (night) — One register for every table; mail workspace mock

**Status:** `tsc` clean, `next build` clean, vitest 350/350. Both pending migrations confirmed
applied on the live database (`board_tasks`, `board_comments`, `companies.home_pinned_*`,
`contacts.title`, `api_clients` all present; `api_clients` is empty, so the API gate must stay
in log-only mode until keys are issued).

### The register

`src/components/ui/register.tsx` is the Companies table pattern made shared: `Register`,
`RegisterHead`, `RegisterTh` (sortable when given `onSort`), `RegisterRow`, `RegisterCell`
(primary over secondary, `first` freezes the identity column), `RegisterGroupRow`,
`RegisterEmpty`. One outlined 16px card, sticky white header with 13px muted labels, py-4
hairline rows, right-aligned tabular numbers, hover #f8f9fa, selected row on soft blue with an
ink bar, status as words. Every table in the product now renders through it: Finance, Contacts
and its companies tab, Inbound leads, Debit Notes, Team, the RFQ scoreboard, the company page
panels (Finance, Purchase history, Quotation, People, thread picker; Activity on the Nexus
dot-row timeline), the Sales lead grid and sources, `/outbound` leads, agent and campaign
tables, Kyn ROI, RAG index, Email evaluation, RoadPlus, the Pricing Matrix calculator list,
quotes, terminology, comparison and mapping tables (`TableShell` re-implemented on the register
with the same API), and the deprecated Group Benefits lists. Rate matrices keep
`.data-table.matrix-table`.

Trade-offs made by the agents: Contacts folds email under the name (one column fewer); Debit
Notes lost the policy-type sort header (filter kept); the Sales lead grid's company sort key is
unreachable from the UI; `InlineReplyRow` colSpan corrected to 6.

### Mail workspace mock (design only, no code)

Artifact: https://claude.ai/code/artifact/f1d89dcd-3069-48ef-a74a-61ffd7e8b1a0 — one navigator
(header, Compose, search, work views, list), content-first reader, earlier messages that unfurl
in place and a nested quoted-history unfurl, on-demand context rail on soft fields, a contained
reply editor with a grouped toolbar, a new-email dialog, phone screens. Buttons are ink, not
navy. Awaiting the owner's review before the inbox is rebuilt to it.

---

## 2026-09-29 (later) — Every page on one design system

**Status:** `tsc` clean, `next build` clean, `npx vitest run` 350/350. Captured all 60 screens
locally; the walkthrough artifact carries them. Nothing deployed from this session.

### What changed

The token layer and the shared primitives moved to the Home system, so every page that
builds on them changed at once: `globals.css` (foreground `#202124`, muted `#5f6368`, border
`#e8eaed`, input `#dadce0`, radius 12px, neutral status and stat tokens, ink filter pills, no
table header band, retuned `.kpi-*`, `.st-*`, `.page-title`), the shadcn `button / input /
badge / tabs / table / card / select / popover / dialog / sheet`, `page-header`, `app-shell`,
`stat-card`, `status-badge`, `shared/status-pill`, `data-table/toolbar`, `detail-section`,
`crm/primitives` (`Btn`, `Segmented`, `Field`, `SectionCard` without a description prop,
neutral `Chip`), and the antd theme in `layout.tsx`. The `--primary` token stays navy because
the inbox, compose and chat hardcode it; no shadcn Button is used inside those surfaces, so
its default variant is now ink.

Then every remaining page was restyled in place, data flow untouched: Nexus (the 4272-line
workspace, phased-analysis modal, RFQ panel, activity feed); the company page and all
`crm/*` panels; Match threads; Finance; Calendar; Claims; Contacts and the companies tab;
Inbound leads; RoadPlus; sign-in and unsubscribed; the eight Analytics / Kyn ROI pages; the
seven `/outbound` pages behind Sales; the Pricing Matrix quote wizard, calculator review,
compare, quotes and terminology with their components; the company contact picker; and a
light pass over the deprecated Group Benefits pages. Settings panels lost their duplicated
card headings and description lines.

Rules applied everywhere: no colour-coded state (every status is one neutral chip with the
label), no alert strips, no explanatory line under a section heading, sentence case, one
filled ink primary per view, 36px titles, hairline tables without a header band, grey
`#f1f3f4` tiles with ink numbers, `PersonTag` for people.

### Deleted

The superseded Phase 11 board components: `src/components/board/{AddTaskForm, AssignmentPicker,
CompanyBoard, CompanyDetail, CompanyRow, FilterBar, SummaryStrip, TaskBullet, WorkloadView,
badges}.tsx`. They were never committed. `useBoardData` now owns the `SyncState` type.

### Judgement calls

- Replies: each drafted reply card keeps its own filled Send; there is no page-level primary.
- The company page header select is the *stage* select (its PATCH only takes `stage`); the
  owner badge falls back to the email's local part because the page has no staff fetch.
- Inbound `constants.ts` still holds colour fields; the dropdown ignores them.
- During local capture with the cron bearer, session-only routes return 401, so Debit Notes,
  Contacts detail, Calendar events and the Settings panels render empty in the shots. That is
  the capture, not the pages.

---

## 2026-09-29 — End-to-end revamp: company as the primary key, Google-Store editorial design

**Status:** `tsc` clean, `next build` clean (API-gate coverage check passed), `npx vitest run`
350/350. Dogfooded end to end on localhost:3111 with the capture cycle (29 screens in the
walkthrough). Nothing deployed from this session; the other account pushes live.

### Handoff for the deploying account

Apply in the Supabase SQL editor, in this order, before or with the deploy:

1. `supabase/migrations/20260922_focus_board.sql` — board_tasks, board_comments,
   contacts.title / signature_read_at, companies.confirmed_at / confirmed_by, and (section 4,
   appended this round) `companies.home_pinned_at` / `home_pinned_by` with a partial index.
   Home falls back to "companies with open to-dos" until the pin columns exist and says so.
2. `supabase/migrations/20260924_api_clients.sql` — the API-gate key registry (the other
   account's own, uncommitted on purpose).

Environment and auth:

- Production Gemini key returns **402, prepayment credits depleted**. Every Gemini feature
  (drafts, triage, debit-note extraction, briefs, Nexus reads) fails until AI Studio billing is
  topped up. Local `.env.local` Gemini keys are invalid; do not use them to verify.
- `ANTHROPIC_API_KEY` must be set for Ask Opus (Nexus, chat dock).
- Add `http://localhost:3111/**` to Supabase Auth → URL configuration → Redirect URLs, or
  localhost sign-in keeps bouncing to production.
- `API_GATE_MODE=log-only` is what local dogfood ran under; production should run the gate
  in enforce mode once the key registry migration is applied.

Deleted: `src/components/engagement/EngagementFolderNav.tsx` is tracked and shows as `D` —
`git rm` it. The rest of what this round removed (PillWall, InboxSections, SummaryCards,
RenewalTabs, CompanyFilterBar, the operations-layout components under `src/components/home/`)
were never committed, so nothing else to do. New directories to add: `src/app/api/board/`,
`src/app/api/outbound/workspace/`, `src/app/api/users/`, `src/components/board/`,
`src/components/companies/`, `src/components/home/`, `src/components/outreach/`,
`src/components/settings/`, `src/lib/api-gate/`, plus the new engagement panes and tests.

### One design system, from the website

Inter; ink `#202124`, muted `#5f6368`, hairline `#e8eaed`; soft fields (`#EAF2FF`, `#F1EEFF`,
`#FFF6D8`, `#EAF6EC`, `#FFF0E7`, `#F5F5F3`, grey `#F1F3F4`); 12px-radius controls; one filled
ink primary per view; TRS navy `#0C338A` kept in the inbox. No colour coding of state, no
alerts, no money warnings anywhere: `board/model.ts`, `companies/badges.ts`, `crm/overview.ts`
and the calendar route drop overdue-payment signals; the calendar shows ended policies in grey
as "Ended N days ago". Finance reconciliation stays out until it is asked for.

### Home is the pinned companies

"Companies to work on", centred search across every company plus Add company. A card is one
company: name, its open to-dos as white square labels scrolling inside the card, and the
owner's badge at the foot with the to-do count and Pin / Unpin. Five per row (three when the
drawer is open). Membership is manual pinning only — `PATCH /api/companies/[id]` with
`{ pinned: true|false }` sets or clears `home_pinned_at` / `home_pinned_by`. Opening a card
opens the company drawer, which is where to-dos are added, edited, assigned and removed
(`TodoEditor`: Enter to add, click to edit, date, person, complete, remove). Owner badges are
`PersonTag`: one of eight hues per email, tinted background, first name.

### Companies is a table with a Clients | Insurers switch

Title, count, the switch, search (`/` focuses), a filter popover (settings-list style with
Reset / Done) and Add company; nothing else above the list. Six columns: Company (frozen),
Stage, Threads with awaiting-reply count, LTV (debit-note gross by currency), Next policy
renewal (date plus "in N days" / "ended N days ago"), Owner and last activity. Default sort is
renewal descending; every header sorts. Insurers are rows in `companies` with `kind =
'insurer'`, listed by `listCompaniesByKind`, and get the same model as clients (owner, pin,
to-dos). Merging the insurer directory into `companies` as the single source of truth is
scoped, not built.

### The company drawer

Header: name, `Client · domain · owner`. Tabs: Overview (to-dos and Pin), Policies (each row
opens the debit note: `/debit-notes?company_id=…&open=…`), Threads (opens the conversation in
All Inbox), Finance (debit note, due, amount due, total). Menu: open company page, pin, add
debit note, edit company. The four mini-cards, Tasks tab and Activity tab from the 28 Sep
drawer are gone.

### All Inbox reads like a mail client

Two panes: one thread list (search, Compose, section select — Needs reply, Waiting, Renewal,
RFQ, Claim, All — density, sync) and the thread. The sections rail is gone. Messages render
their real HTML in chronological order, quoted history collapsed (`splitQuotedHtml`), typography
via `.email-html-body` in `globals.css`, latest message scrolled into view. The composer is a
collapsed "Reply to X…" line that expands to the compose panel; its controls now sit on one
top bar — Reply · From · Signature · Generate AI reply · Approve & Send · Minimise. The context
rail is a column at 1680px and wider, a sheet below that.

### Navbar and Settings

Home · Companies · All Inbox ▾ (All Inbox, Nexus) · Product ▾ (Debit Notes, Pricing Matrix,
Match Threads, Contacts, Finance, RoadPlus) · Sales · Calendar · Analytics ▾. Settings sits
under the avatar (`placement: 'account'`). Team is merged into Settings, structured like Alps
Wills: an internal nav (You: profile, signatures · Team: team · Operations: insurers, RFQ,
email templates, How it works) and a roster table. `/team` redirects to
`/settings?section=team`. The roster reads Supabase Auth users on TRS domains joined with
`employee_profiles` (`GET /api/users`, session or cron bearer, read-only); invite, role and
suspend are admin-only and never act on self.

"How it works" is the workflow diagram (`WorkflowDiagram`): the five doors a company comes in
through (All Inbox new domain, debit-note approve, Pricing Matrix quote, Sales move-to-sales,
Add company), the company at the centre, and every page as a view of it, plus the six-step
loop. The same diagram is in the walkthrough artifact.

### Sales is a campaign workspace

Campaigns | Leads | Pipeline | Sources, backed by `GET /api/outbound/workspace`. Campaign rows
with a side panel (compact metrics when the panel is open), a lead grid with a lead panel,
Move to Sales (lead becomes a company at Prospect), New campaign, sources view. `/pipeline`
is the stage view.

### Debit notes, Pricing Matrix 2.0

Both debit-note flows (new and historical) fill the company from the extracted `client_name`
by exact normalised match against `/api/companies?search=` (`useAutoMatchCompany`), and the
picker opens pre-filled when nothing matches. Debit Notes list, new and historical screens use
the Home tokens (`Field` labels, `inp`).

Pricing Matrix 2.0 phase 1: the page on the Home system with a "What's new" field in plain
English; the census editor flags rows without a date of birth or age, or an age outside 0–99,
with a `#FFF6D8` row tint and a summary line. Phases 2–6 (value column, scenarios, grounded
recommendation, quote → policy) are scoped, not built.

### Nexus

Every case has Ask Opus in the chat dock with two change prompts in the empty state; the dock
already supports confirm-to-act edits through `/api/nexus/cases/[id]/edit-analysis`.

### Not built, on purpose

Insurer directory merge into `companies` (migration plus RFQ routing); Pricing Matrix 2.0
phases 2–6; deeper debit-note drawer and calculator restyles; finance reconciliation.

---

## 2026-09-28 (later) — Companies rebuilt around the company, navbar in the website's design

**Status:** `tsc` + `next build` clean, tests pass. No new migration beyond the one already
pending (`20260922_focus_board.sql`).

### The navbar looks like the website

Same 56px white bar with the soft blur, the same Inter at 14/500 in muted ink that darkens on
hover, the current section in a quiet navy tint, and dropdowns as white rounded cards with a
title and one-line description per entry. The sections and their contents are unchanged: Home,
Companies, All Inbox, Sales Outreach, Nexus, Calendar, Finance, Tools, RoadPlus, Analytics,
Team, Settings. The shadcn navigation-menu and dropdown primitives are no longer used by it.

### Companies is the register, with the overview in a drawer

Built to the Harvey-inspired brief. Five summary cards (clients, renewals within 90 and 30
days, awaiting reply, past due), each a filter. A renewal strip — All policies, Within 90 / 60
/ 30 / 7 days, Overdue, No renewal date — with counts, cumulative and labelled as such, hover
text spelling out the inclusion rule. A filter bar for search, stage, owner (including
"assigned to me" and "unassigned"), operational badge and sort, with active-filter chips and a
clear-all.

The table: company with health dot, domain and owner; stage; up to three operational badges
(overdue item, payment overdue, blocked, renewal due, awaiting reply, high priority, claim
open, RFQ active, no owner, unconfirmed) with the rest collapsed and every badge a filter;
threads with the awaiting-reply count; to collect with the past-due line in red; next renewal
with date, plain-English distance and a bucket tag; owner avatars; last activity. Rows are
keyboard selectable. Cards on a phone.

Selecting a row opens a 440px drawer over the table without losing filters or position, and
moving between rows keeps it open. Escape closes. It has a sticky header (name, domain, stage,
health, renewal tag, overflow menu with open page / add item / link thread / add policy / edit),
four mini-cards that jump to a tab, and six tabs: Overview, Policies, Threads, Tasks, Finance,
Activity. The tabs reuse the company page's own components, so nothing is duplicated. Overview
runs in the brief's order: needs attention, policy renewals with View in Calendar, alerts and
where we left off, company information with an owner picker.

### One renewal vocabulary, shared with Calendar

`src/lib/crm/renewal.ts` is the single definition of the bands (Overdue, 0–7, 8–30, 31–60,
61–90, beyond 90, no date) and the cumulative windows. Companies, the drawer and the Calendar
all read it. The Calendar gained the same window chips, an "Open company" link on every
renewal that lands in the Companies drawer, a `?date=` parameter so the drawer can hand off to
the right month, and a new event kind: policies past their end date and still marked active,
pinned to today, which the old feed silently omitted.

### One data model

Home and Companies both read `/api/board` through a shared hook, so a task ticked on one is
ticked on the other and both hear the database change feed.

---

## 2026-09-28 — Home is the company board

**Status:** `tsc` + `next build` clean, 345/345 tests pass. **Migration to apply:**
`supabase/migrations/20260922_focus_board.sql` (rewritten; it had not been applied).

Home was rebuilt to the collaborative board brief. Every client company is a row; the row
says what is most pressing right now, who owns it, the nearest deadline, status and priority,
open-item count and last activity. Clicking a row expands it in place, without leaving the
page: account header with owner, health, renewal and money; the list of pressing items, each
with a checkbox, deadline, one primary owner plus collaborators, priority, status and a
comment thread; and an add form defaulting to the signed-in person.

Above the table, an urgency strip — Overdue, Due today, Due this week, Renewals, Claims, RFQs,
Awaiting reply — with live counts that filter the board. A filter bar for search, owner,
status, priority and sort, with four views: Table, By urgency, My work and Team workload, and a
collapse-all control. Every write is optimistic with a Syncing / Saved just now / Not saved
indicator, and the database change feed keeps two people's screens in step. Table on desktop,
trimmed columns on tablet, stacked cards on a phone. Keyboard operable throughout; no state is
carried by colour alone.

Where a company has no items yet, the row still says why it matters, from the same roll-up the
companies list uses: emails awaiting reply, money past due, a renewal inside sixty days.

The task model changed to fit: a task hangs off the company directly (no separate "on the
board" step), and carries priority, status (on track / awaiting client reply / blocked /
complete), a primary owner, collaborators and comments. The tile board from 22 September is
gone; the company header now shows the count of pressing items and deep-links to the row.

---

## 2026-09-22 — Focus board, the email workflow locked, stakeholder titles

**Status:** `tsc` + `next build` clean, 345/345 tests pass. **One migration to apply:**
`supabase/migrations/20260922_focus_board.sql`. Everything degrades safely until it is.

### The focus board replaces the printed fortnightly list

On Home, above everything else. One tile per company, any number of tasks on the tile, each
task tagged to a person from a picker of everyone who has signed in. Anyone adds a company,
anyone removes one, anyone ticks a task done. Two people looking at it see each other's changes
within a second through the database change feed, with a 30-second poll behind it. Every change
is written to the audit log and the last few show under the board. Filters for All, Mine and
Unassigned. Each tile links to its company page, shows what is waiting there (awaiting reply,
past due, next renewal), and each company page carries an "On the board" or "Add to board"
control in its header.

### The email workflow, locked

Every inbound email now resolves in this order, and every step is deterministic except the last:
known domain → domain stem names an existing company (so `@flavia` finds "Flavia Holdings Pte
Ltd" instead of making a twin) → the organisation in the sender's signature matches a company →
client named in the subject → **create**, whatever the model's confidence, and mark the record
unconfirmed. The model names it when it answers; the domain names it when it does not. The
queue that left eleven Mpinsb threads unfiled for a week is gone. Only threads carrying nothing
but personal or excluded addresses wait for a person.

Guards: a not-a-client list (KYN, Singapore ISPs), insurer-owned domains never become clients,
and something the model is fairly sure is *not* a client — a hospital, a bank, a claims TPA —
files as a partner so it stays off the client list.

Unconfirmed companies show an amber Confirm control in the header and a dot on the list.

### Stakeholder titles from signatures

The first time a person writes to us, the model reads the tail of that one email for their
position and the organisation as they write it. Stored once; re-read only if a later signature
differs. The People tab now shows the title, and marks anyone who has only ever been copied.
The organisation from the signature also feeds the company match above.

### Contacts linked to companies

Only 41% of contacts belonged to a company. Every sweep now ends by giving each contact the
company that owns their email domain: 218 link immediately, a further 128 as soon as their
companies are created, personal mailboxes and TRS staff are left alone.

### Also

- `rankPeople` was reading a column dropped in July (`insurer_contacts.contact_email`), silently
  getting an empty list, so insurer contacts were being classed as "other". Fixed.
- Two real duplicates remain for a person to merge: BLL twice, and "Cold Chain Refrigration"
  (typo) beside "COLD CHAIN REFRIGERATION". The Huang Pu Soya Bean pair are two branches.

---

## 2026-09-11 (late) — The calendar shows everything that has a date

**Status:** `tsc` + `next build` clean, 339/339 tests pass. No migration.

The calendar carried two things: policy renewals and debit notes whose due date fell inside the
month you were looking at. For September that was seven events. Everything else with a date on
it lived somewhere you had to go and look for.

Three categories added.

**Money already past due**, pinned to today rather than left in the month it lapsed. This was
the real gap: September showed nothing to collect while 35 notes worth S$240,408 sat overdue
and invisible. The amount shown is what is still outstanding after any recorded payment, not
the face value of the note, and each one links straight to Finance to record the payment.

**Insurers who have not answered an RFQ**, landing on the day they cross the service level set
in Settings, or today if they crossed it earlier. Three are waiting now, two of them since
July.

**Deadlines the Nexus analysis recommended.** The agent has been producing next steps with
deadlines all along and they went nowhere.

Two bugs found while wiring this up:

- **The insurer join silently returned nothing.** Two foreign keys connect dispatches to
  requests, one of them a dead column from the old bind flow, so the database refused the
  ambiguous join and the route swallowed the error as an empty list. Disambiguated.
- **The agent writes deadlines as prose.** Of 53 recommended deadlines on file, 51 read
  "Within 48h" or "Before policy expiry" and only 2 were real dates, so almost nothing could
  ever be scheduled. The model is now asked for a calendar date worked out from today, with
  the human phrasing kept alongside it in `deadline_text`. Existing analyses keep their prose
  and simply do not appear until a case is re-analysed.

September now shows 45 events instead of 7. The legend names all five kinds, and the day view
gives each its own card with the right action on it.

---

## 2026-09-11 (night) — Model routing confirmed and centralised, Ask Opus moves to the client

**Status:** `tsc` + `next build` clean, 339/339 tests pass. No migration.

### Confirmed: an ordinary email thread never touches Opus

Traced end to end. Ingest, categorisation, thread summary, reply drafting, RAG, attachment
reading and draft evaluation are all Gemini. Opus appears nowhere in the path, and the Opus
dock is not even mounted on the inbox.

### Every model id now comes from one file

Only one call in the whole engagement path actually read `gemini-models.ts`; the rest hardcoded
the URL, so the documented env override did nothing. All of them now route through it:
classify, refresh-summary, auto-summarize, draft, RAG draft and embedding, draft evaluation,
the instruction composer, attachment extraction, and the five RFQ and Nexus drafting routes.

### One thread summary, one standard

The Refresh button wrote the summary with Flash; the automatic pass after a reply wrote the
same row with Flash Lite. The quality of a thread's analysis depended on which one happened to
run. Both now use Flash.

### Nexus phase three no longer waits on itself

Gemini writing the emails and Opus building the verified timeline are independent, and were
running one after the other. They now run together.

### Ask Opus belongs to the client

It used to be scoped to a Nexus case file. It is now the client's consultant, titled as such:
opening a case resolves the company behind it, including through the case's threads for RFQ
cases that were created without one, so the conversation covers the claim, the renewal and the
money together. A case with no company still falls back to case scope, which keeps the
steering and re-analysis actions reachable.

Three new tools make "ask anything about this client" true:

- **get_company_cover** — every policy with insurer, period, premium billed and commission
  earned, plus lifetime customer value and renewal dates.
- **get_company_cases** — each Nexus case with its latest brief, blocking issues, open
  questions, next steps and scenarios.
- **search_company_email** — full-text search across every message on the client's threads,
  returning the surrounding excerpt, for a figure or promise buried in a long thread.

---

## 2026-09-11 (evening) — Relationship-manager pass: value, Nexus brain, RFQ speed

**Status:** `tsc` + `next build` clean, 339/339 tests pass. No migration.

### The company header is one line

Stage, owner, domain and the facts that decide what to do next now sit on a single row.
Industry and the stage date moved into Edit, where they belong.

### Purchase History shows the money

`policies.premium` has never been populated by any import, which is why every row read as a
dash. The money is on the debit notes, which carry a policy id, so each policy now shows what
was actually billed against it and what TRS earned.

Above the table is **Customer value**: total premium billed, TRS commission with its effective
rate, policy count, client since, last billed. The currency is stated, not assumed.

### Nexus: Opus is the brain, Gemini is the eyes

The split was **not** right and is now fixed. Gemini Flash was deciding the judgement calls —
what is blocking the case, what is unanswered, what is missing, how each party stands — and
Opus only ever saw Gemini's JSON summary, never the emails themselves.

- **Opus now reads the original correspondence** in the strategy pass, not just the extraction,
  budgeted to 220k characters with the newest mail kept.
- **Opus re-derives the judgement** and its answer overrides the extraction: blocking issues,
  open questions and missing items including contradictions between parties.
- **Gemini's job is stated plainly in its own prompt**: extraction, not judgement. Evidence
  ledger, timeline, citations, exact figures and dates. It still writes the email prose once
  Opus has decided what each email must achieve.
- Model ids now come from `gemini-models.ts`, so an env override actually takes effect. The
  stale "Gemini 2.5 Pro" labels in the code and in the progress banner are corrected.

### Generate is a modal again, with a progress bar

The Nexus tab no longer lists every thread inline. **Generate case analysis** opens a picker of
this client's threads, filtered by kind, with a second page that searches every thread in the
inbox for a matter that runs through a mailbox never filed under this client.

Each analysis phase now shows a real progress bar with the model doing the work and the seconds
elapsed, and says so when a phase is taking longer than usual rather than sitting on a spinner.

### Quotes expand

Clicking an RFQ opens it in place: every insurer written to, who has replied, how many days the
rest have been waiting, a link to each insurer conversation, and the premium, excess, limit and
validity read out of the reply with the document they came from.

### RFQ opens quickly again

Picking a thread took several seconds on a blank panel. The cause was the line-detection model
call sitting inside the render gate, with the case lookup queued behind it.

- The model call is off the critical path and its result only pre-ticks suggestions, which is
  how the original flow worked before the company revamp.
- The case lookup joined the parallel batch instead of waiting behind the model.
- A skeleton replaces the single line of grey text.
- Detected lines are cached per thread, so reopening one is free.
- The prompt drops quoted reply chains and caps at 3,000 characters instead of 12,000.
- The company page now passes the real message id, which makes the lookup a primary-key read
  **and** restores the client's own email into the insurer drafts, which had been silently lost.

### Threads is full screen

The Threads tab runs edge to edge under one slim bar that continues the main navigation: back,
client name, thread count, and the other tabs on the right. Back returns to Overview.

---

## 2026-09-11 (later) — Finance reconciliation, and the engagement dock removed

**Status:** `tsc` + `next build` clean, 339/339 tests pass. One migration to apply (below).

### The engagement thread is just mail again

The four tabs along the bottom — Customer, AI Analysis, RFQ, Pricing Quote — are gone, and so
is the dock that held them. Everything they did now has a better home: the client record is the
company page, RFQ starts from the company's Quotation tab, and quotations live in the pricing
matrix. The dock was a second, narrower copy of each.

The agent's read on a thread was the one thing worth keeping in the mail view, so it is now
inline above the messages rather than hidden behind a tab. Reading the mail and reading the
analysis are the same job.

Removed with it: the deprecated group-benefits census quote, which was the last thing still
reaching into the retired first-generation quoting flow.

### Finance: clearing a balance by recording the payment

Every debit note on file still read as outstanding, because the only way to record a payment
was to type into three fields in the debit-note drawer and nobody ever had. The dashboard was
reporting an entire historical import as money owed.

**New Finance section in the main nav.** Every note with money against it, oldest first, with
the client attached. Record what came in: amount, date, whether the client paid TRS, settled
direct with the insurer, or it was written off, plus a reference. Part payments are fine and
the balance carries. The page leads with how much of what was billed has been collected, not
with a single red total.

**Record payment sits on the client's page too**, in the tab now called Finance rather than
Outstanding Payment.

**A receipts ledger, not a status field.** Each payment is its own row in `debit_note_payments`
and a trigger keeps the debit note's amounts and status derived from it, so the two can never
disagree. A payment can be undone and the balance comes back. Before the migration is applied
the screens still work and write straight to the debit note; a notice on the page says so.

**Two long-standing faults fixed by the same change.** Settling direct with the insurer now
counts toward the balance, where before the tick and its status were stored and never read. And
what is still to collect is now worked out from the amounts everywhere, so the register and the
company page can no longer show the same note as Unpaid in one place and Paid in the other.

**Softer language throughout.** "Outstanding" is now "to collect", "overdue" is "past due", and
the status words read Settled, Part paid, Awaiting payment and Past due.

**Migration to apply:**

```sql
-- supabase/migrations/20260911_debit_note_payments.sql
```

---

## 2026-09-11 — Everyone is a client, the to-do list is gone

**Status:** `tsc` + `next build` clean, 335/335 tests pass. One optional migration (see below).

### Prospect is reserved for sales outreach

Until Sales Outreach is wired in, we have no way of knowing whether somebody is a prospect
rather than a client, so the distinction was noise. Everything that arrives in our mail is now
filed as a client. Every place that created a company — the new-company dialog, the API, the
automatic filing, triage, lead conversion — now opens it at **Client**.

`suggestStage` was rewritten to match. It can still suggest **Quoting** when a quote is open,
**Renewal due** inside the 60-day window and **Lapsed** after 550 days of genuine silence, but
it will never suggest Lead or Prospect again. Those two stages stay in the list so that sales
outreach can use them when it lands, and the help text on each says so.

The 68 companies still sitting at Prospect in the live data were moved to Client. Every client
company is now at stage Client bar the handful the agent suggests moving.

### The to-do list has been removed

It was a second place to look, it duplicated what Needs attention already said, and keeping it
honest meant deciding on proposals that mostly restated the obvious. It is gone entirely:

- The **To do** card on Home, and the accept/dismiss buttons with it.
- The **To do** column on the companies table and the "to review" chips on the companies list,
  the pipeline board and the company page.
- The `company_actions` API routes, the next-action extraction, the agent's
  `list_company_actions` tool and the `crm_actions` AI-usage bucket.
- Finished actions no longer appear on the company timeline or in "where we left off".

The company brief still lists open items in prose, which is where the useful part lived.

**Optional migration.** Nothing reads the table any more; it can be dropped when convenient:

```sql
DROP TABLE IF EXISTS public.company_actions;
```

---

## 2026-09-12 — Company page restructured, navigation renamed

**Status:** `tsc` + `next build` clean, 334/334 tests pass. No migration.

### The tab strip no longer scrolls

The page was 860px wide with a scrollbar under the tabs. It is now 1200px and all eight tabs sit on one line from 1024px up, with the full words kept: **Overview · Nexus · Threads · People · Purchase History · Quotation · Outstanding Payment · Activity**. Only a phone or an iPad in portrait scrolls them.

### Nexus is its own tab

It opens with the whole-company summary, then the cases already opened, then a thread picker. Tick the threads that belong to one matter and press Generate: they become a case and the full analysis runs (the same phased Gemini-then-Opus run the Nexus workspace uses), with the brief, blocking issues, next steps and scenarios shown on the tab. Each case still links to the full workspace. A case is named from what you picked, so nothing is called "Untitled".

### Threads is the mail reader

Unchanged from yesterday, minus the checkboxes, which now belong on Nexus where combining happens.

### Quotation runs the real RFQ flow in place

Start RFQ opens a picker of this company's threads, ordered so the likely request is first. Choosing one runs the established flow without leaving the page: the agent reads the thread and works out the product lines, you pick the insurers for each line — one or many — review the drafted wording and send.

### Outstanding Payment is its own tab

Split out of Quotation. Shows what is owed with the reminder drafting, and hides settled debit notes behind a toggle.

### Purchase History

Policies renamed, and its sections now read "Active cover" and "Expired and cancelled".

### Overview trimmed

To do and Recent threads are gone. Overview is now Needs attention and Where we left off, nothing else.

### Navigation

`Home · Companies · All Inbox · Sales Outreach · Nexus · Calendar · Tools · RoadPlus · Analytics · Team · Settings`. Inbox sits beside Companies and is named All Inbox; Pipeline is Sales Outreach; Calendar is out of Tools and on the bar. Tools keeps Debit Notes, Pricing Matrix, Filing and Contacts.

### One consequence worth knowing

"Find next actions" lost its button when the To do block left the company page. Existing proposals stay actionable — Home's To do now accepts and dismisses in place — but nothing generates new ones. Say where it should live if you want it back.

## 2026-09-11 (night) — Reading a company's mail on its own page

**Status:** `tsc` + `next build` clean, 334/334 tests pass. No migration.

The Threads tab was a list that sent you to the global Inbox and lost the company context. It is now the Inbox experience, scoped to one company: the conversation list on the left, the conversation itself on the right, and the real composer for replying — the same message cards (`EngagementMessageCard`) and composer (`EngagementComposePanel`) the Inbox uses, so drafting, signatures, attachments and sending behave identically. Nothing was duplicated or reimplemented.

Wide screens show list and conversation side by side with the first thread already open. A phone shows the list, then the conversation with a way back. Reviewed at 390, 834 and 1440 px; no horizontal overflow.

`src/components/crm/CompanyMail.tsx`. The old link out to `/engagement?lead=` is kept as a small icon for anyone who wants the full workspace with the AI analysis dock and RFQ tabs.

### Bug fixed: every thread claimed to have "0 messages"

`email_threads.message_count` is 0 on all 360 rows — nothing has ever maintained that column. The company thread list now counts the message rows it already loads, so a thread with fourteen messages says so. Guarded by a test.

### Note on the Inbox stalling

The Inbox was seen stuck on "Loading conversations…" with every count at zero. All three endpoints behind it (`/api/engagement/conversations`, `/api/leads`, `/api/engagement/thread`) return correct data locally in about two seconds, so this looks like a stale production deploy rather than a code fault. Reading a company's mail no longer depends on that page in any case.

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
