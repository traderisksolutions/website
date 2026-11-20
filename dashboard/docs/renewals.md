# Renewals

Renewals are the source of truth for what comes up for renewal and the sales driver (Jarod, 20 Nov 2026). Release 1 fixes the data and opens renewal records. Release 2 adds Pipeline and Forecast.

## Data model

Migration: `supabase/migrations/20261120_renewals.sql`. Additive. **Not applied.** Every route answers `{ tables: false }` until it is.

| Table / column | Holds |
| --- | --- |
| `renewals` | One record per policy term being renewed: `policy_id`, `company_id`, `line_code`, `insurer`, `expiry_date`, `opens_on`, `expiring_premium`, `expiring_commission`, `currency`, `owner`, `stage`, `outcome` (null, renewed, lost), `loss_reason`, `loss_note`, `renewed_policy_id`. One open record per policy (unique index where `outcome` is null). Indexed on `expiry_date`, `stage`, `owner`. |
| `renewal_tasks` | Four tasks per record: `kind` -90, -60, -30, -15; `due_on`; `done_at`, `done_by`. |
| `policy_lines` | The fixed list of lines (code, name, sort), seeded. |
| `policies.line_code` | The policy's line. Written only when a person confirms it. |
| `policy_line_aliases` | A class-of-insurance spelling (lower case, single spaces) confirmed as a line, by whom, when. |

Code: `src/lib/renewals/` — `lines.ts`, `rules.ts`, `open.ts` (pure, tested), `store.ts` (reads and writes), `http.ts`. Routes: `/api/renewals` (GET, PATCH), `/api/renewals/open` (POST), `/api/renewals/fix` (GET, POST). Pages: `/renewals`, `/renewals/fix`. Not in the top bar yet.

## Rules

| Rule | Value |
| --- | --- |
| Opens | 120 days before expiry; 180 for Employment Benefits (`is_eb`, or the Employment Benefits line). |
| Who gets a record | Bound or live policies (not quotes) filed under a client, not endorsements, ending no more than 30 days ago, with no next term on the register (same client and class, starting within 45 days of the end) and no earlier record. |
| Opening | `POST /api/renewals/open`, from the Open renewals due button. Idempotent. `openDueRenewals()` can be called by the daily admin sweep later; it is not in the sweep. |
| Tasks | 90, 60, 30, 15 days before expiry. |
| Expiring premium and commission | The latest new business or renewal debit note for the policy, plus the notes that reverse or correct it (signed amounts). A note reversed to zero is skipped. Code only. |
| Owner | The client's `companies.owner_email`; else empty, editable. |
| Stages | Open · Data asked · Marketing · Quotes in · Proposed · Instructed · Renewed / Lost. |
| Renewed | Only with `renewed_policy_id` (the new term, not the expiring policy). |
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

Keeps dates only. No change in release 1.

## Release 2

- Pipeline: records by stage, owner and line; close as Renewed (link the new policy) or Lost (reason) from the record.
- Forecast: expiring premium and commission summed by month, by line and owner.
- Task list per owner from `renewal_tasks`; the daily admin sweep calls `openDueRenewals()`.
- Renewals in the top bar (`nav-sections.tsx`).
- Renewal Season (`/renewal-season`, work_items cases) folds into the renewal record.
