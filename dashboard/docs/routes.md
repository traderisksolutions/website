# Routes between records

Where each record links to, and where Back goes. Guarded by `tests/journeys/routes.spec.ts`.

## Back

Back goes to the page the record was opened from. The trail (`src/lib/nav/trail.ts`) records it:

- A top-bar or place-tab click starts a new trail (`startFresh`).
- A list page (Inbox, Companies, Quotes › Employment Benefits, Today) is the first step.
- A detail page adds itself through `Breadcrumbs`. The Inbox thread adds itself in `ThreadView`.
- Before a link is followed, the step for the current page takes the address bar's tab or filter (`syncHere`). Back returns to `?tab=eb`, not the bare page.
- With nothing on the trail, Back goes to the page's owner (`fallback`).

## Employment Benefits

| From | Click | Lands on | Back goes to |
| --- | --- | --- | --- |
| Quotes › Employment Benefits | A company row | Compare cover of that quotation | Employment Benefits list |
| Company page | Employment Benefits (header) | Company's newest Compare cover; New quotation if none | The company |
| Inbox thread | Rail › Employment Benefits › Compare cover | Company's newest Compare cover; New quotation if none | That thread |
| Today › Coming up › EB renewals | Compare cover / Open census | Compare cover / New quotation | Today |
| Compare cover | Ask insurers | Plan builder | Compare cover |
| Compare cover | One change at a time | Analysis | Compare cover |
| Compare cover | Today › Census and policy (or Add last year's policy) | The quotation's census and policy (`/pricing-matrix/quote/<id>/edit`); Confirm reprices it in place | Compare cover |
| Employee lists | Quote (a submitted HR link) | New quotation with the list as the census (`/pricing-matrix/new?hrLink=<id>`) | Employee lists |
| Quotation (older page) | Upload employee list | The quotation's census and policy | The quotation |
| Employment Benefits | Plan rules (tab) | Plans that go together, per insurer, with the brochure page | Employment Benefits |

One screen enters a census and last year's policy: New quotation (`NewEb.tsx`). A new quotation, an existing one and an HR link's list all open it. Quick quote and the By hand wizard are retired.

`/pricing-matrix/company/<companyId>` resolves the company's Employment Benefits (`src/lib/gb/company-eb.ts`). Quotations carry the company by name, matched with `companyKey`.

## Records

| From | Link | To |
| --- | --- | --- |
| Company page | Claims (header) | Claims, that client only (`/claims?company=<id>`) |
| Company page | Policies tab › Open policy | Policy |
| Policy page | Client, Debit notes, Claims, Employment Benefits (EB lines) | Company, debit notes, claims of that policy |
| Inbox rail | Company, Policy, Debit notes, Claims | Company, policy, debit notes, claims |
| Today › Coming up | A renewal's policy line | Policy |
| Today › Coming up | A payment's debit note line | Debit note |
| Today › EB renewals | Policy | Policy |
| Placement line, bound | Policy | Policy |
| Debit note issued | Open debit note | Debit note |

## Not linked yet

- Debit note detail › policy, company, receipt.
- Policy page › its quotation.
