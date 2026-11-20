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
| Quotes › Employment Benefits | A row of the Quotation register | The proposal (`/eb/proposal/<id>`) | Quotation register |
| Company page | Employment Benefits (header) | The company's Employment Benefits tab (`?tab=eb`) | The company |
| Inbox thread | Rail › Employment Benefits › Quotations | The company's Employment Benefits tab | That thread |
| Renewal Season | An Employment Benefits row › Proposal / New quotation | The client's newest proposal / `/eb?company=<id>` | Renewal Season |
| Employee lists | Quote (a submitted HR link) | New quotation with the list as the census (`/eb?hrLink=<id>`) | Employee lists |
| Old quotation address | `/pricing-matrix/quote/<id>` and anything under it | The re-priced proposal (`eb_quotations.legacy_gb_id` = id), else the Quotation register | — |
| Employment Benefits | Plan rules (tab) | Plans that go together, per insurer, with the brochure page | Employment Benefits |

One screen enters a census and last year's policy: New quotation (`/eb`). `/pricing-matrix/new` and `/pricing-matrix/company/<companyId>` redirect there and to the company's Employment Benefits tab.

The old quotation pages (Compare cover, Census and policy, One change at a time, Plan builder, report) were deleted on 20 Nov 2026 once 16 of the 21 gb_quotations were re-priced into eb_quotations; the 5 not moved stay in gb_quotations as an archive and their addresses land on the register.

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
| Today › Renewal Season | Client, Policy, Wish list, Documents, Compare, Open | Company, policy, the wish list dialog, the case's Brief, Compare cover or New quotation or the case's Comparison, the case's Brief |
| Placement line, bound | Policy | Policy |
| Debit note issued | Open debit note | Debit note |

## Not linked yet

- Debit note detail › policy, company, receipt.
- Policy page › its quotation.
