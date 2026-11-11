# Refactor plan

Started 11 Nov 2026 after the client said the dashboard is hard to find things in and after the code had grown past the point where one person can hold it. Six phases. Each phase ships on its own, behaviour unchanged unless the phase says otherwise, with `npm run check` green and the deploy routine in `CLAUDE.md`.

## Baseline, 11 Nov 2026

| Measure | Value |
| --- | --- |
| Source lines (excluding tests) | 125,874 in 1,063 files |
| Pages | 80 |
| API routes | 345 |
| Tests | 160 files, 1,709 tests |
| Library folders with no test | crm (32 files), gb (32), sales (23), marketing (21), placement (19), hr (15), nexus (7) |
| Component tests | 0 |
| API route tests | 0 |
| Lint | no config; 82 errors, 96 warnings once configured |
| Unused source files | 36 |
| Unused dependencies | 17 (10 Radix packages, Supabase client, pg, reactflow, resizable panels) |
| Unused exports | 457, plus 356 unused types |
| `money` formatter written locally | 31 files |
| `fmtDate` written locally | 16 files |
| `timeAgo` written locally | 7 files |
| Raw `fetch('/api/…')` calls in UI | 347 in 124 files; one shared `callApi` in `placement/shared.tsx` |
| Files over 1,000 lines | `app/nexus/cases/page.tsx` 3,756; `lib/run-nexus-analysis.ts` 1,931; `api/email/ingest/route.ts` 1,051; `lib/placement/workflow.ts` 1,020 |
| Loose files in `src/lib/` | 65 |
| Folders named by a letter | `lib/admin/a`, `b`, `k`, `p` |
| Top bar | 9 places, 36 tabs; Growth holds 12; Today holds 7 |
| Record search | none. ⌘K finds page names only. |

## Rules for every phase

- One commit per step, each with `npm run check` green and a clean-worktree `next build`.
- No behaviour change inside a step unless the step says so and the changelog records it.
- `/api/email/send` is not touched. The local change to `src/lib/ai-call.ts` is never committed.
- Deploy only on Jarod's go, by the routine in `CLAUDE.md`.
- A deleted file is a deleted file; nothing is kept "in case". Git has it.

## Phase 1: hygiene. Done 11 Nov 2026

- ESLint configured (`next/core-web-vitals` + `next/typescript`, `no-explicit-any` as a warning). 11 errors fixed. Lint runs inside `next build`, so a lint error now fails the deploy before it reaches Vercel.
- `knip` configured; `npm run knip`. 35 unused source files deleted, 15 unused dependencies and 1 unused type package removed, `jszip` declared.
- `npm run check` added. GitHub Actions `dashboard-check` runs type-check, lint and tests on every push that touches `dashboard/`.
- `src/lib/format.ts`: one `money`, `num`, `fmtDate`, `fmtDateTime`, `timeAgo`. Local copies replaced where the output is identical; copies inside PDFs, emails and CSV exports stay until Phase 6 gives them snapshot tests.

## Phase 2: findability. Awaiting decision

The client's complaint. Two changes.

**Record search in the top bar.** A search field (not only ⌘K) that finds companies, people, threads by subject, policies by number and insured, quotes, debit notes and documents, grouped, eight per group, Enter opens the first. One route, `/api/search?q=`, six PostgREST `ilike` reads in parallel through `src/lib/search.ts`. ⌘K opens the same field; page names stay as a group inside it.

**Fewer places, fewer tabs.** Recommendation:

| Place | Tabs |
| --- | --- |
| Today | Today, Follow-ups, Calendar |
| Clients | Companies, People, Board, Unfiled threads |
| Inbox | Inbox, Inbound |
| Quotes | Requests, Benefits calculator, Insurers |
| Policies | Policies, Members, Claims, Second opinion |
| Finance | Receipts, Debit notes, Earnings |
| Documents | Documents |
| Growth | Enquiries, Leads, Campaigns, Mailing list, Marketing (its own tab row: Articles, Generate, Schedule, Newsletter, Knowledge, Competitors, Search Console, Sites) |

`/` redirects to `/today`. `/work` (Queue) is retired: Today has held the same cases since 2 Nov with the approve-and-send path. Nexus moves under the avatar with the other analysis views. RoadPlus moves under the avatar. Net: 8 places, 24 first-row tabs.

Open to Jarod: whether Home, Board and Queue go, and whether Marketing stays visible to TRS staff at all.

## Phase 3: one API client

`src/lib/api/client.ts` exporting `api<T>(path, init)`: parses the error body, throws `ApiError { status, message }`, and the UI shows the message. Replaces the 347 raw `fetch` calls folder by folder, starting with `components/engagement` and `components/placement`. Deletes `placement/shared.tsx`'s `callApi`. The "Request failed (409)" text that reached the client on 11 Nov came from a raw fetch with no error body read; this phase makes that impossible.

## Phase 4: the four giants

| File | Lines | Becomes |
| --- | --- | --- |
| `app/nexus/cases/page.tsx` | 3,756 | `components/nexus/cases/*` (list, case, panels, helpers), page under 150 lines |
| `lib/run-nexus-analysis.ts` | 1,931 | `lib/nexus/analysis/*` (prompt, read, score, store) |
| `api/email/ingest/route.ts` | 1,051 | `lib/mail/ingest/*` (fetch, file, dedupe, classify); route under 80 lines |
| `lib/placement/workflow.ts` | 1,020 | `lib/placement/workflow/*` (request, quote, decline, bind) |

Each split lands with tests on the pure functions it exposes.

## Phase 5: library layout

The 65 loose files in `src/lib/` move into their domains: `gb-*` into `lib/gb/`, `debit-note-*` into `lib/debit-notes/`, `gdrive*`/`onedrive` into `lib/storage/`, `email-*`/`parse-eml`/`gmail-send` into `lib/mail/`, `run-*` into their agent folders. `lib/admin/a`, `b`, `k`, `p` get names that say what they are. Imports updated by codemod; no logic change.

## Phase 6: tests where the money is

Tests for the folders that price, file and send and have none: `crm` (resolve, autofile, board), `gb` (builder, ladder, scenario-run, client-draft), `placement` (workflow, lines, quote-read), `sales` (runner, outreach). Snapshot tests for the debit-note PDF, the client report PDF and the appointment letter, which then lets Phase 1's remaining local formatters go. Route tests for `/api/engagement/conversations`, `/api/board`, `/api/placements/auto`.

## Order and effort

| Phase | Effort | Risk |
| --- | --- | --- |
| 1 Hygiene | 1 day, done | low |
| 2 Findability | 2 days | medium: the client sees it |
| 3 API client | 2 days | low |
| 4 Giants | 3 days | medium: nexus and ingest run every night |
| 5 Layout | 1 day | low |
| 6 Tests | 3 days | none |
