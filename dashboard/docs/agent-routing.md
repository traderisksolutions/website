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
