# Client 360

Every business has its own repository: the company group's ledger (`company_ledger`, every email, document, policy, debit note, claim, case event, quotation and placement, with links), its facts (`company_facts`, each with the words it was read from) and its numbers (`src/lib/clients/portfolio.ts`). An agent reads one business at a time.

Goal (Jarod, 13 Nov 2026): find the 20% of clients that earn 80% of commission, take their admin off people, and spend the time on winning other clients. Only TRS's own records and conversations are used; no paid data.

## Accuracy rules, from Nexus

1. One message, one narrow question; code fixes the parties (by domain), the model reads meaning.
2. Every answer passes a pure cleaner: enums, lengths, addresses only from the message.
3. Every fact keeps its source (message or file id) and the words it was read from; a quote not found in the source is dropped (`verifiedFacts`).
4. Each message is read once (claimed first), retried up to 3 times; writes are idempotent.
5. Figures come from records first (debit notes, claims, policies), emails second.

## Gaps found (13 Nov 2026)

| Gap | Size | Status |
| --- | --- | --- |
| Ledger incomplete: documents, case events, insurer-thread emails, claims never logged | 15,262 of 27,066 rows | Fixed: backfill, now 27,163 + new rows |
| Emails on insurer threads filed against a client after they arrived never reached the client's ledger | One top-3 client: 2 of 92 emails | Fixed: filing records the thread (`recordThread`) |
| A person's pick of a different client on an insurer thread was ignored | Every re-pick | Fixed: a person's pick overrides (`fileClient` override) |
| Requests on insurer threads counted under the insurer | 175 of 940 requests had no client | Fixed in the portfolio: resolved as Nexus resolves threads |
| Quotations and placements not in the ledger | 33 + 62 | Fixed: deposited; 7 quotations match no single client |
| No numbers per business | — | Built: Portfolio and Knowledge › Numbers |
| Debit note status never maintained | 410 of 410 read "unpaid" | Open |
| Debit notes without commission | 75 of 410 | Open |
| Claims without a paid amount | 377 of 514 | Open: loss ratio states its coverage |
| Policies without premium | 434 of 459 | Premium read from debit notes |
| Emails on threads filed to no company | 781 | Open: Unfiled threads |
| Insurer mail not read into facts (premium terms, endorsement confirmations, claim decisions) | All insurer mail | Phase 2 |
| Fact keys free text ("company.name", "company_name", "business.name") | 4,545 facts | Phase 2: one key list |

## Phases

1. **Repository complete, numbers, Pareto** (built 13 Nov 2026): ledger backfill and hooks, Portfolio (Clients › Portfolio), Knowledge › Numbers.
2. **Facts from insurer mail, one key list, Ask about this client**: the knowledge keeper reads insurer threads filed against the client with the Nexus rules; facts move to a fixed key list; a question agent reads one business's repository.
3. **Admin automation for the top 20%** (started 14 Nov 2026): the admin desk (open requests, repeats, movements per business) and the first rule that takes a repeat off people: TPA claim notices move claims on the register. Next: rules for the other repeats the desk shows (the monthly enrolment's chase and forward), within manual AI.
4. **Renewal outlook**: premium change per insurer against loss ratio, from TRS's own renewal history once enough outcomes are on file.
