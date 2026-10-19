# HR Connect

A client's HR provides the employee list for a group benefits quotation through a link the broker sends from the dashboard. Three ways in: upload an Excel or CSV, paste a Talenox API token, or give a Workday integration user. The list lands on the quotation as a submission and feeds Quick quote. No model is involved anywhere in this flow.

## Where it lives

- Broker: Pricing Matrix → HR links tab → Send a link; row → link page (timeline, received list, Resend, Close, Quote from this list). Company page → Quotation → Send HR a link.
- HR: `/connect/<token>` (public, no sign-in; `/connect` is in `PUBLIC_PATHS`), then `/upload`, `/talenox`, `/workday`, `/review`, `/done`.
- API: dashboard `/api/group-benefits/hr-links/**` (session or cron bearer); public `/api/public/hr/<token>/**` (open in the API gate, reason in `src/lib/api-gate/policy.ts`; 60 requests per 10 minutes per token per server instance).
- Code: `src/lib/hr/` (types, tokens, links, email, public, rate-limit, spreadsheet, talenox, workday, connectors), `src/app/connect/**`, `src/components/hr-connect/**`, `src/components/group-benefits/hr/**`.
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

HR pastes an API token from their Talenox account (API access is on every Talenox plan). One call to `https://api.talenox.com/api/v2/employees` with the token as a bearer; the token is used once and not stored. Field mapping is tolerant (`name` or first + last; `birthdate`, `date_of_birth` or `dob`; resign date in the past → inactive). Not yet exercised against a live Talenox account: the mapping is unit-tested on a sample response. First live run: open a link, paste a real token, compare the list with the Talenox screen.

## Workday

The client's Workday administrator creates an Integration System User, grants Get access on the domains "Worker Data: Public Worker Reports" and "Person Data: Date of Birth", and gives HR the tenant host (for example `wd3.myworkday.com`), tenant id, user and password. HR enters those on the page; the dashboard calls `Get_Workers` on the Human_Resources SOAP service with a WS-Security username token, pages through the results, and discards the password. Names use Workday's formatted name so a Chinese name keeps its order. Terminated and future-dated workers are shown and excluded. Not yet exercised against a live tenant; parsing is unit-tested on a sample response. There is no Workday sandbox without a client.

## Not built

Deel, BambooHR and aggregators (scope cut 19 Oct 2026; costs in the HR Connect design artifact). Manual entry on the HR page: HR edits the uploaded rows and adds dependants, but cannot start from an empty list.
