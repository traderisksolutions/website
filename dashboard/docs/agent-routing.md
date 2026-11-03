# Agent routing: main agents and line sub-agents

Decided 4 Nov 2026. Each kind of work has one main agent. The main agent reads the email,
names every policy line it touches, and hands one task per line to that line's sub-agent.
Routing is plain code on the existing `agent_tasks` queue. There is no orchestration framework:
the routes are fixed, and the queue already gives retries, idempotency and an audit trail.

## Line sub-agents (desks)

| Desk | Product lines | Work in the mailbox, Jun–Nov 2026 |
| --- | --- | --- |
| eb | employee_benefits, group_health, group_personal_accident, foreign_worker_medical, group_travel | 489 threads |
| car | construction_car | 161 |
| wica | wica | 124 |
| financial | professional_indemnity, do, cyber, imi | 146 |
| motor | commercial_vehicle | 113 |
| property | iar_fire, business_interruption, machinery_breakdown, electronic_equipment, stock_throughput | 105 |
| liability | general_liability, environmental_liability, medical_malpractice | 83 |
| general | everything else: bonds, marine, transit, trade credit, keyman, personal lines | 215 |

The map lives in `src/lib/agents/desks.ts`.

## Phases

| Phase | Main agent | Sub-agents | Status |
| --- | --- | --- | --- |
| 1 | Endorsement | eb and motor (member and vehicle lists); others go to general | Built 4 Nov |
| 2 | New request | eb, wica, liability; others go to general | Built 4 Nov |
| 3 | New request | car, financial, property, motor | Built 4 Nov |
| 4 | Renewal and claim | All desks | Built 4 Nov |

## Phase 1: endorsement main agent

Code: `src/lib/agents/endorsement/main.ts`. Queue: agent `endorsement_main`, kind `inbound_mail`.

1. **Voice.** A client or insurer email is read as written. When TRS staff forward a client's
   email, it is read as the client's email. Any other staff email is not an endorsement.
2. **Insurer.** An insurer's email goes to the note reader for its policy, as before.
3. **Client and policies.** The agent works out which live policies the email touches:
   - by policy number;
   - otherwise by the lines it names (body, subject, attachment names), e.g. "FWMI & EB";
   - otherwise by the company's member policies, preferring EB.
4. **Split.** One run per policy touched. A person on a list that names a line ("FWMI: …") is
   applied only to that line's policy; an unmarked list applies to every policy touched.
5. **Desks.**
   - eb and motor run the movement intake: read, date gate, batch, price.
   - Other desks are logged as routed to general and stay with the case worker until their
     phase is built.
6. **Date gate.** A heads-up or undated movement is held (`date-gate.ts`, 4 Nov 2026).

Each run records its routing in the task result: `voice`, `policies`, `desks`, `per_policy`.
Read the `agent_tasks` results to measure routing.

## Phase 2: new-request main agent

Code: `src/lib/agents/new-request/` (`main.ts` merges; `wica.ts`, `liability.ts`, `eb.ts` review).
Called from `autoPlaceFromThread` (`src/lib/placement/auto.ts`) after the lines are read.

Each sub-agent returns client questions, whether they block the market (the line is held),
notes for the broker (placement log, actor `new_request_main`), and suggested extra lines put to
the client as a question. The questions go out in the one data-request email the drafter writes.

- **wica**:
  - headcount and annual wages per category, checked by wage per head (a monthly or per-person
    figure is held);
  - job scope when categories are only "staff";
  - claims including MOM reports;
  - non-manual staff over S$2,600 a month flagged;
  - FWMI and bonds suggested for work permit holders.
- **liability**:
  - flow by request; PL asked with a CAR or bond is contract cover;
  - contract: the clause, the CAR third-party check, and WICA or PI suggested when the clause
    names them;
  - products: territories, USA or Canada flagged;
  - event: dates, venue, attendance;
  - any business giving advice or design: PI suggested.
- **eb**:
  - the considerations that decide the plan: budget, ward, dependants, outpatient;
  - claims experience on a renewal;
  - personal accident is left to its sums insured.
  - Pricing: see the EB pricing model below.

The lines already open as placements were checked in a dry run (no model calls, no writes),
which caught two misreads now fixed: project PL read as small-business PL, and medical questions
on personal accident.

## Phase 3: car, financial, property, motor

Same shape as phase 2, in `src/lib/agents/new-request/{car,financial,property,motor}.ts`.

- **car**:
  - notes: tender (indicative) versus award; capacity planning from S$100m; EAR when the scope
    is erection or installation;
  - asks: the soil report and excavation for ground works; principal's existing property for
    works on an existing building; the lender's clause;
  - suggests PEL or WICA.
- **financial**: revenue by country (packaged PI excludes the USA and Canada); known incidents;
  the expiring schedule with the retroactive date; IPO notes for D&O; leverage notes for
  investment managers.
- **property**: the exact occupation and sums insured by item; the tenancy insurance clause;
  the lender's clause; business interruption; open cover for portfolios; package plans for small
  premises. Equipment and stock lines get their own questions.
- **motor**: driver ages and licence pass dates; NCD per vehicle; expiry alignment and the
  claims-by-vehicle note for fleets; specialist vehicles.
- **All lines**: cover starting before today asks the signed nil-claims letter of undertaking, once.

The dry run on the open placements caught five misreads; four are fixed:
- "Contractors' Plant" read as erection;
- "soil investigation" works read as ground works;
- premises questions on equipment and stock;
- the same question asked twice.

The fifth was the backdated-cover ask showing on adopted cases. That is an artefact of the dry
run: cases picked up midway skip the review.

## Phase 4: renewals and claims

**Renewals** (`src/lib/agents/renewal/review.ts`, called from the renewals sweep). At the 90-day
mark the line's sub-agent writes the items of the client data request and notes for the broker:
- **eb**: the updated member list and any change in benefits or serious conditions; the expected
  load when the price check says increase; package cards to compare up to 100 employees.
- **wica**: wages and headcount by category; injuries including those reported to MOM; a call
  first when a claims loading is likely.
- **financial**: the signed renewal proposal form, revenue by country, incidents; no gap in
  claims-made cover.
- **property**: sums insured at today's rebuilding cost (average clause); changes of use or location.
- **motor**: vehicles added or sold, new drivers, accidents including those not claimed.
- **liability**: turnover, contracts that now ask for cover or a higher limit, claims.
- **Project cover (CAR, bonds)** is extended, not renewed. From 45 days out an **Extension
  check** case asks whether the works finish in time and whether the maintenance period has started.
- **General lines** keep the line's usual documents.

**Claims** (`src/lib/agents/claims/review.ts`, called from the claims agent). The class's
sub-agent adds its first actions to the claim's gaps and its notes to the case when it opens:
- **wica**: MOM iReport within 10 days.
- **motor**: report within 24 hours or the next working day, and no repair before the survey.
- **property**: police report for theft, and keep damaged items.
- **liability**: the third party's letter, and admit nothing.
- **marine**: notice to the carrier.
- **trade credit**, read from the words: unpaid invoices, chasing letters, and the overdue
  notification limit.
- **financial**: the letter of demand; notify within the policy period.

A deadline that can still be met and falls within two days goes to a person. A past deadline on
an old claim does not.

**Dry run** (no writes):
- 37 policies end in the next 90 days: 11 eb, 7 property, 5 financial, 4 wica, 4 car (extension
  checks), 2 motor, 1 liability, 3 general.
- 236 open claims: 37 asks added, no deadline alarms today.
- The backfilled claims use a second class vocabulary (WICA, EB, PI…); the sub-agent reads both.

## EB pricing model (reverse-engineered 4 Nov 2026)

Source: 30 EB cases in the mail, Jun–Nov 2026, with 379 quoted figures. 295 reproduce exactly,
51 within 2%, and 33 not at all. Of the 33, 12 are errors in TRS's own sheets, 9 are insurer lump
sums, 5 used the wrong card version, 3 are Cigna and 4 lack data. The full model, with formulas
by insurer and the reproduction table, is kept outside the repo (session scratchpad `eb/model.md`).

**Two regimes, by employee count:**
- **Up to 50 employees (QBE MCare+), or up to 100 (Income FlexCare, Singlife):** the package
  card per age band and plan, priced in-house. It reproduces exactly on the card in force.
- **Above that:** the insurer quotes a rate per head or per S$1,000 of sum assured, from the
  fact-find and the claims history. The arithmetic reproduces; the rate is the underwriter's.

**Built now:**
- The card in force on the effective date, separately for new business and renewals
  (`src/lib/gb/table-version.ts`, column `gb_rate_tables.renewal_effective_date`). The QBE V12
  card is dated new business 1 Jul 2026 and renewals 2 Sep 2026.
- Package size limits: an insurer whose package the headcount exceeds is left out with a note,
  not priced on a card that does not apply.
- Employee-only personal accident (QBE, Raffles RCC): a dependant on it no longer drops the insurer.
- EB sub-agent:
  - the regime;
  - the fact-find, claims and renewal-notice asks for custom cases;
  - the pre-existing condition question;
  - the Singlife takeover rule.

**Built 4 Nov 2026, second pass:**
- QBE MCare+ V11 (Jan 2026 card) loaded as its own approved card, from the Table_Jan26 sheet of
  the Steadfast calculator:
  - dated new business from 1 Jan 2026;
  - 20% co-insurance plans derived as 0.8 × the full-cover rate;
  - GP and specialist ages 66+ take the "Above 50" rate, since that card had no 66+ band.
  - Check: Amazing Collective reproduces exactly (S$6,829.00 private and S$4,052.00 government
    4-bed). The same census from 1 Jul moves to V12 (S$8,352.36).
  - Undo: delete the rows in `scratchpad/eb/qbe-v11-undo.json`.
- `src/lib/gb/custom-quote.ts`:
  - Income family tiers (2.5× and 3.5×) and QBE per-life rates (child 0.8×);
  - sum assured, flat or as a salary multiple, and the premium per S$1,000;
  - the renewal load and the year-end headcount adjustment;
  - a check of the insurer's stated premium against its own basis. Insurer quotes captured from
    the mail run that check, and a mismatch (the Genscript term life slip) holds the quote for a
    person.

- Insurer rates screen: on an EB line with a census, **Enter insurer rates**
  (`src/components/placement/CustomRatesDialog.tsx`):
  - shows the census by plan and family tier;
  - takes each product's rates by method (family tier, per life, flat, per S$1,000);
  - totals with GST as you type, and checks the insurer's stated total;
  - files the result as a quote (source `custom_rates`) in the same comparison grid as the
    engine's prices.

**Still open:**
1. Cigna Care Connect: the 1.0 card prices 6.6% under the quote, and there is no 2.0 card on
   file. The 2.0 rate card is needed from Cigna.
