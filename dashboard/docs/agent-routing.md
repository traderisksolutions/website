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
| 2 | New request | eb, wica, liability; others go to general | Building |
| 3 | New request | car, financial, property, motor | |
| 4 | Renewal and claim | All desks | |

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

**Not built yet, in order:**
1. Load the earlier QBE card (V11, Jan 2026) so renewals before 2 Sep 2026 price.
2. Custom quotes: per-head rate by plan and member type (Income: spouse or children 2.5×,
   family 3.5×; QBE: child 0.8×), held and compared like package quotes.
3. Sum-assured products: rate per S$1,000, flat or as a salary multiple (GTL, GPA), with a check
   of the insurer's own arithmetic.
4. Movements and renewals: pro-rata by days/365 plus GST, year-end headcount adjustments,
   renewal = expiring × (1 + load).
5. Cigna Care Connect: the 1.0 card prices 6.6% under the quote; no 2.0 card is on file.
