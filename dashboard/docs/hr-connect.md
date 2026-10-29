# HR Connect

A client's HR provides the employee list for a group benefits quotation through a link the broker sends from the dashboard. Seven ways in: upload an Excel or CSV, or connect Talenox, SimplePay, HiBob, Deel, BambooHR or Workday with a credential the client creates in its own system. The list lands on the quotation as a submission and feeds Quick quote. No model is involved anywhere in this flow.

## Where it lives

- Broker: Pricing Matrix → HR links tab → Send a link; row → link page (timeline, received list, Resend, Close, Quote from this list). Company page → Quotation → Send HR a link.
- HR: `/connect/<token>` (public, no sign-in; `/connect` is in `PUBLIC_PATHS`), then `/upload`, `/talenox`, `/simplepay`, `/hibob`, `/deel`, `/bamboohr`, `/workday`, `/review`, `/done`.
- API: dashboard `/api/group-benefits/hr-links/**` (session or cron bearer); public `/api/public/hr/<token>/**` (open in the API gate, reason in `src/lib/api-gate/policy.ts`; 60 requests per 10 minutes per token per server instance).
- Code: `src/lib/hr/` (types, tokens, links, email, public, rate-limit, spreadsheet, talenox, simplepay, workday, connectors), `src/app/connect/**`, `src/components/hr-connect/**`, `src/components/group-benefits/hr/**`.
- Tables: `hr_links`, `hr_link_events`, `hr_submissions` (migration `20261019_hr_connect.sql`, applied 19 Oct 2026).

## The link

- Reference `GB-<year>-<NNNN>`, one sequence per year. Token: 32 random bytes, stored as a SHA-256 hash, 7 days, closed on submit. Resend issues a new token and expiry.
- Email from `operations@trade-risksol.com` (`DEFAULT_FROM`), display name "Trade Risk Solutions Operations", reply-to the same, cc optional, plain-text part, one button, the full URL in text. Sent through the Gmail sender the dashboard already uses (service-account impersonation when `GOOGLE_SERVICE_ACCOUNT_JSON` is set, else the OAuth refresh token). If the send fails the link still exists and the dashboard shows Copy link so the broker can hand it over another way.
- Link base URL: `NEXT_PUBLIC_APP_URL`, else `https://<VERCEL_URL>`. Set `NEXT_PUBLIC_APP_URL` to the stable dashboard host so emailed links do not carry a per-deployment hostname.
- After submit: receipt to HR and a notice to the sender, same address.

## Upload

Any layout. Headings matched by synonym (name, date of birth, gender, category or grade, work pass, hire date, status, employee id, relationship, parent employee). Dates read day-first; a date that cannot be read is left empty and flagged, never guessed. Date cells are read as Excel serials so a machine's timezone cannot shift them. Columns for salary, pay, NRIC, FIN, passport, IC, address, phone, email and bank are discarded on read and never stored. A file with a relationship column carries dependants under their employee; without one it is employees only and HR adds dependants on the review page.

Verified 19 Oct 2026 on a 15-row Gembridge file with a title row above the header, mixed text and date cells, a missing date, a salary and an NRIC column: 6 employees, 9 dependants, 2 columns discarded, every date exact.

## Talenox

HR pastes an API token from their Talenox account (API access is on every Talenox plan). One call to `https://api.talenox.com/api/v2/employees` with the token as a bearer; the token is used once and not stored. Field mapping is tolerant (`name` or first + last; `birthdate`, `date_of_birth` or `dob`; resign date in the past → inactive). Dependants (added 23 Oct 2026): each employee's `next_of_kins` gives name, relationship, birthdate and gender; spouse, wife, husband, partner → spouse; child, son, daughter → child; parents, siblings and emergency contacts are ignored. When the list omits `next_of_kins`, each active employee's record is read once (`GET /employees/:id`, 5 at a time, at most 300); a failed read leaves that employee without dependants and never fails the list. HR confirms them on review. Not yet exercised against a live Talenox account: the mapping is unit-tested on a sample response. First live run: open a link, paste a real token, compare the list with the Talenox screen.

## SimplePay

Added 23 Oct 2026. HR creates an API user in SimplePay (Settings → Users → API Users; owner or administrator) with access to the company being quoted and pastes the key. `GET https://api.payroll.simplepay.cloud/v1/clients` lists the companies the key can see; one is read directly, several return 409 with the list and HR picks. Then `GET /v1/clients/:id/employees` (items wrapped as `{ employee: {...} }`): first and last name, birthdate, job title, appointment date, termination date. The key goes in the `Authorization` header as is, is used once and not stored. SimplePay keeps no dependants and no gender, so HR adds spouse and children on review and a missing gender is not flagged. Limit 1,000 requests an hour per key; 429 and 503 have their own messages. Not yet exercised against a live account.

## Workday

The client's Workday administrator creates an Integration System User, grants Get access on the domains "Worker Data: Public Worker Reports" and "Person Data: Date of Birth", and gives HR the tenant host (for example `wd3.myworkday.com`), tenant id, user and password. HR enters those on the page; the dashboard calls `Get_Workers` on the Human_Resources SOAP service with a WS-Security username token, pages through the results, and discards the password. Names use Workday's formatted name so a Chinese name keeps its order. Terminated and future-dated workers are shown and excluded. Not yet exercised against a live tenant; parsing is unit-tested on a sample response. There is no Workday sandbox without a client.

## How a client connects (no TRS login to their system)

TRS never holds the client's HR login. The broker sends the link; the client's HR or admin creates a read credential inside their own system, enters it on the link page, and the server uses it for one read, then drops it. Not stored, not logged, not in `source_meta`, not echoed. HR sees the list, edits it, adds dependants and submits. The client can revoke the credential straight after. Sensitive fields (identity numbers, pay, bank, contact) are removed from the kept vendor record at any depth, camelCase keys included.

## HiBob

Added 29 Oct 2026. The Bob admin creates a service user (Settings → Integrations → Service users), adds it to a permission group with View on Basic info, Work and Personal fields for active employees, and gives HR the ID and token. `POST https://api.hibob.com/v1/people/search` with Basic auth (ID:token) and `{ fields, showInactive: false }`; on 400 (a field this account lacks) it retries with Bob's default set. Bob omits fields the service user cannot see without failing, so a missing date of birth is flagged with the permission to add. No dependants in Bob's standard fields. Not yet exercised against a live account.

## Deel

Added 29 Oct 2026. A Deel admin creates an organisation token with `people:read` (Apps & Integrations → Developer → Access tokens). `GET https://api.letsdeel.com/rest/v2/people?limit=100&offset=N`, Bearer token, up to 3,000 people. Contractors and people working outside Singapore are kept but flagged so HR removes them on review. No dependants. Not yet exercised against a live account.

## BambooHR

Added 29 Oct 2026. HR enters the company subdomain and an API key created under a login that sees every employee (profile menu → API Keys). Basic auth with the key as user and `x` as password. `POST https://api.bamboohr.com/api/gateway.php/<company>/v1/reports/custom?format=JSON&onlyCurrent=true` for name, date of birth, gender, status, hire and termination dates, job title, department; then `GET …/v1/employeedependents` for spouse and children, which needs benefits-administration access and is skipped (list still saved, `meta.dependantsRead = false`) when refused. BambooHR's developer terms are written for installed apps; here the customer enters its own key and is told it can delete it after. Not yet exercised against a live account.

Migration `20261029_hr_hibob_deel_bamboohr.sql` (applied 29 Oct 2026) sets the `hr_submissions.source` check to every source, SimplePay included.

## Not built

Aggregators (Merge, Kombo, Apideck). Swingvy, JustLogin, Payboy, HReasily and Info-Tech have no public API; their clients export to Excel. Manual entry on the HR page: HR edits the uploaded rows and adds dependants, but cannot start from an empty list.
