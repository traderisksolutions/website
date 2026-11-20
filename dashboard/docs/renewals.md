# Renewals

Renewals are the source of truth for what comes up for renewal and the sales driver (Jarod, 20 Nov 2026). Release 1 fixes the data and opens renewal records. Release 2 adds Pipeline and Forecast.

## Data model

Migration: `supabase/migrations/20261120_renewals.sql`. Additive. Applied in production (20 Nov 2026); the tables are in `src/lib/db/database.gen.ts`. Every route still answers `{ tables: false }` where the tables are missing.

| Table / column | Holds |
| --- | --- |
| `renewals` | One record per policy term being renewed: `policy_id`, `company_id`, `line_code`, `insurer`, `expiry_date`, `opens_on`, `expiring_premium`, `expiring_commission`, `currency`, `owner`, `stage`, `outcome` (null, renewed, lost), `loss_reason`, `loss_note`, `renewed_policy_id`. One open record per policy (unique index where `outcome` is null). Indexed on `expiry_date`, `stage`, `owner`. |
| `renewal_tasks` | Four tasks per record: `kind` -90, -60, -30, -15; `due_on`; `done_at`, `done_by`. |
| `policy_lines` | The fixed list of lines (code, name, sort), seeded. |
| `policies.line_code` | The policy's line. Written only when a person confirms it. |
| `policy_line_aliases` | A class-of-insurance spelling (lower case, single spaces) confirmed as a line, by whom, when. |

Code: `src/lib/renewals/` — `lines.ts`, `rules.ts`, `open.ts`, `pipeline.ts`, `forecast.ts` (pure, tested), `store.ts` (release 1 reads and writes), `pipeline-store.ts` (release 2, typed client), `http.ts`. Routes: `/api/renewals` (GET, PATCH), `/api/renewals/open` (POST), `/api/renewals/fix` (GET, POST), `/api/renewals/pipeline` (GET), `/api/renewals/forecast` (GET), `/api/renewals/tasks` (GET), `/api/renewals/:id` (GET), `/api/renewals/:id/tasks` (POST). Pages: `/renewals` (Pipeline), `/renewals/forecast`, `/renewals/fix`, `/renewals/<id>`. Top bar: Renewals, after Clients.

## Rules

| Rule | Value |
| --- | --- |
| Opens | 120 days before expiry; 180 for Employment Benefits (`is_eb`, or the Employment Benefits line). |
| Who gets a record | Bound or live policies (not quotes) filed under a client, not endorsements, ending no more than 30 days ago, with no next term on the register (same client and class, starting within 45 days of the end) and no earlier record. |
| Opening | `openDueRenewals()`: the Open renewals due button (`POST /api/renewals/open`) and the daily admin sweep (`/api/cron/admin-sweep`, before the expiry roll). Code only, idempotent. |
| Tasks | 90, 60, 30, 15 days before expiry. |
| Expiring premium and commission | The latest new business or renewal debit note for the policy, plus the notes that reverse or correct it (signed amounts). A note reversed to zero is skipped. Code only. |
| Owner | The client's `companies.owner_email`; else empty, editable. |
| Stages | Open · Data asked · Marketing · Quotes in · Proposed · Instructed · Renewed / Lost. |
| Renewed | Only with `renewed_policy_id`: a policy of the same client, not the expiring one (`checkRenewedPolicy`). |
| Lost | Only with a reason: price, service, no contact, client closed, other. Other needs a note. |
| Closed | A Renewed or Lost record does not change. |
| Days buckets | 0-30 (overdue included), 31-60, 61-90, 91-120, 121+. |

## Lines of business

Every policy maps by code rules (`lineFor`) to one line. The rule matching earliest in the text wins, so a combined cover takes its first-named line. A person confirms each spelling on To fix before it is written.

Counts on 20 Nov 2026, all 460 policies, by the suggested line:

| Line | Policies |
| --- | ---: |
| Employment Benefits | 45 |
| Foreign Worker Medical | 38 |
| WICA (incl. employer's liability) | 46 |
| Group Personal Accident | 18 |
| Group Travel | 5 |
| Public Liability (incl. general and event liability) | 43 |
| Professional Indemnity (incl. investment and asset manager liability) | 38 |
| Directors & Officers | 6 |
| Cyber | 7 |
| Property / Fire / IAR (incl. machinery, electronic equipment, home) | 18 |
| Contractors' All Risks (incl. erection all risks, renovation) | 51 |
| Marine Cargo (incl. transit, stock throughput, freight forwarder) | 9 |
| Motor (incl. fleet, motor trade) | 55 |
| Bonds (performance, surety, security, rental) | 25 |
| Trade Credit | 1 |
| Business Package (OfficeCare, ShopCare, BizSupreme and similar) | 31 |
| Domestic Helper | 8 |
| Travel | 10 |
| Other (GATLB, WCODC, Excess Protector) | 6 |

## To fix

| Table | Shows | Writes |
| --- | --- | --- |
| Policies without an end date | Live and bound policies only (107 quotes without an end date are left out). Suggested end date: start + 1 year − 1 day, else last placing debit note issue + 1 year − 1 day, marked Suggested. | `policies.end_date` on Confirm or Confirm all suggested (asked first); never over a date already set. |
| Lines to map | Distinct spellings not yet confirmed, with policy count and suggested line. | `policy_line_aliases` and `policies.line_code` (and open renewals' `line_code`). Needs the migration. |
| Policies with no placing debit note | Live and bound policies with no new business or renewal debit note. | Nothing; links to the policy page. |

## Calendar

Keeps dates only. No change in releases 1 and 2.

## Release 2 (20 Nov 2026)

Renewals is a place on the top bar after Clients: Pipeline · Forecast · To fix.

### Pipeline (`/renewals`)

| Part | Rule |
| --- | --- |
| Header | N open · next 120 days · S$ gross: open records expiring within 120 days (overdue included) and their expiring premium. |
| Pills | All open · 0–30 days · 31–60 · 61–90 · 91–120 · 121+ · Lost · Renewed. All open is chosen first, so Lost and Renewed are hidden until picked. |
| Filters | Owner, Line, Stage, At risk. The pill counts follow the filters. |
| Table | Client (anchored; policy number under it), Line, Insurer, Expires (date; days under it), Premium, Commission, Stage (chip, with risk chips), Owner, Next task (the earliest task not done; due date under it). A row opens `/renewals/<id>`. |

### At risk (open records only)

| Flag | Rule |
| --- | --- |
| No contact 30 days | Expiry within 30 days, and no message either way on the client's threads (`email_threads.company_id`) in the last 30 days. Only threads from the last 30 days are read. |
| Quote over +10% | The lowest quote this term is more than 10% above the expiring premium. This term: made on or after the record opened. Placement quotes match by client and line (`product_line` mapped by `lineOfPolicy`); declined or withdrawn quotes do not count. Employment Benefits also reads the client's quotations (`eb_quotations`): each product's premiums summed over every category and cover, the lowest product taken. |
| Still Open | Stage Open with under 30 days to expiry, overdue included. |

### A renewal (`/renewals/<id>`)

Facts (policy, insurer, expiry, line, expiring premium and commission, lowest quote this term, owner, last client email, opened); links to the client, the policy, the client's threads and, for Employment Benefits, New quotation (`/eb?company=`). Stage as a pill row. Tasks with Mark done / Undo (`done_at`, `done_by`). Close as Renewed (the new term chosen from the client's other policies, searchable) or Lost (reason; Other needs a note), each confirmed. Lines held (the client's live policies' lines) and Lines not held (the rest of the fixed list, Other left out). A closed renewal shows its outcome and does not change.

### Forecast (`/renewals/forecast`)

| Part | Rule |
| --- | --- |
| Items | Every renewal record, plus every renewable policy expiring in the window with no record yet and no next term on the register (counts as Open; premium and commission from its debit notes, line from `line_code` else `lineOfPolicy`, owner from the client). |
| Months | The current month and the 11 after it, by expiry month. |
| Columns | Due (count, premium, commission), Won (Renewed), Open, Lost (count; premium under it), Gross retention. |
| Gross retention | Renewed expiring premium ÷ due expiring premium, for a month with nothing open. The total row takes the closed months only. |
| Chart | Commission expiring by month: one series, one axis, each bar labelled; hover names the month, the amount and the count. |
| Filters | Line, Owner. |

Figures on 20 Nov 2026 (no records opened yet, so every item is a policy waiting): 134 due in the 12 months, S$3,209,759 gross, S$283,717 commission; May 2027 carries S$155,415 commission.

### Today

Renewals due · N sits above By client when tasks are due today or before and not done, for the person whose Today is open (Everyone: all owners). Nothing shows when none are due (`GET /api/renewals/tasks?who=`).

### Renewal Season

`/renewal-season` is removed; the Pipeline replaces it (TOD-027 to TOD-032). Comparison, wish list and Client summary stay on the renewal case page.

### Not in release 2

- Renewal records do not yet fold in the work_items renewal cases.
- Stages do not move by themselves (quote sent → Marketing).
- Expected commission is not checked against insurer statements.
