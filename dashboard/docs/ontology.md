# TRS Ontology — v0 Object Model

Not a Palantir Foundry deployment. This is the same idea (objects, links, actions as a
governed layer over raw tables) applied to the Supabase schema already defined in
`full_schema.sql`, so every page reads/writes through one typed vocabulary instead of
each page inventing its own interpretation of a row.

## Why this is worth doing now

The sales-pipeline schema (`customers`, `deals`, `policies`) is already defined in the
database but is queried almost nowhere in `src/` — only `src/lib/debit-note-commit.ts`
touches it. Meanwhile `src/app/claims/page.tsx` treats rows from `inbound_leads` as
"Claims" by filtering `source === 'claims_form' || department === 'Claims'`, and renders
its own status vocabulary (`new / contacted / qualified / converted / dropped`) that does
not match the table's actual `inbound_leads_status_check` constraint
(`new / contacted / engaged / qualified / closed / spam`). That drift — one row, two
incompatible ideas of its lifecycle, decided locally in a page component — is exactly
what an ontology layer exists to prevent.

## What "ontology" means in Palantir's own framing

Per [Foundry's "Why Ontology" doc](https://www.palantir.com/docs/foundry/ontology/why-ontology),
Palantir doesn't pitch the Ontology as a data model — it pitches it as a representation of
*decisions*, built from four parts: **Data**, **Logic**, **Action**, **Security**. Mapping that
onto what this doc is actually proposing for TRS, to be explicit about what's being borrowed
and what isn't:

| Palantir's pillar | What it means there | What v0 here actually covers |
|---|---|---|
| Data | Structured, streaming, unstructured, imagery, plus "decision data" from users choosing things | Structured only — the existing Supabase tables. No streaming/unstructured/imagery sources. |
| Logic | Business rules, ML models, optimization, AI reasoning, bound into a common interface | Not modeled yet. The action guards in the table below (e.g. "must have email or phone") are the only logic; no ML/AI reasoning layer. |
| Action | Staged as reviewable "scenarios" before writing back to source systems | No staging/scenario concept — actions here write directly, same as today. This is a simplification, not an oversight. |
| Security | Marking-, purpose-, and role-based access, computed per-request | Out of scope for v0 — Supabase RLS today is whatever it already is; not touched by this doc. |

The one piece of Palantir's framing that *does* carry over directly is the **objects/links are
nouns, actions are verbs** distinction — that's the actual mechanism that fixes the drift
described above (Claims page inventing its own status vocabulary). The rest of Palantir's
pitch — decision lineage, human/agent parity, real-time closed-loop decisioning — is aimed at
operational-decision platforms at a scale and domain (defense, supply chain, healthcare ops)
that doesn't match a CRM/policy-admin dashboard over Supabase. Worth knowing about so this
doc's "ontology" isn't confused for that, not worth building toward here.

If this ever grows into something closer to the real thing, the natural next pillar to add
(after objects/links/actions from Phase 1 below) would be **Logic** — centralizing the
guard/transition rules in one place instead of scattering them across action functions — since
that's the cheapest of the four to bolt on incrementally.

## Object types (from existing tables)

| Object | Source table | Key properties | Status / lifecycle |
|---|---|---|---|
| Company | `companies` | name, domain, type, industry | type: institution / sme / corporate |
| Contact | `contacts` | full_name, email, phone, source, tags | engagement_stage: engaged → qualified → proposal → converted |
| Customer | `customers` | type, account_manager, customer_since | status: active / renewal_due / lapsed / cancelled |
| Deal | `deals` | title, product_type, value_estimate, close_date_estimate | stage: new → discovery → proposal → negotiation → closed_won / closed_lost |
| Policy | `policies` | policy_number, insurer, product_type, sum_insured, premium, start/end/renewal_date | status: active / expired / cancelled |
| Interaction | `interactions` | type, summary, created_by | type: call / meeting / note / email / whatsapp |
| InboundLead | `inbound_leads` | source, topic, department, message | status: new / contacted / engaged / qualified / closed / spam |
| OutboundLead | `outbound_leads` | record_type, current_company, headline | status: new / contacted / engaged / qualified / proposal / converted / closed / spam |
| EmailThread / EmailMessage | `email_threads`, `email_messages` | subject, snippet, direction | thread status: active / resolved / archived |
| WhatsappConversation / WhatsappMessage | `whatsapp_conversations`, `whatsapp_messages` | direction, message | conversation status: active / resolved |
| AIDraft | `ai_drafts` | channel, body, generated_by | status: pending / approved / rejected / sent |

## Link types (from existing foreign keys)

```
Company    1──* CompanyContact *──1 Contact
Contact    1──1 Customer            (customers.contact_id)
Company    1──* Customer            (customers.company_id, optional)
Customer   1──* Deal
Customer   1──* Policy
Deal       1──* Policy              (policies.deal_id, optional)
Customer   1──* Interaction ── optional Contact, Deal
Contact    1──* EmailThread ── optional Customer, Deal
Contact    1──* WhatsappConversation 1──* WhatsappMessage
InboundLead  1──1 Contact (contacts.inbound_lead_id, optional)
OutboundLead 1──1 Contact (contacts.outbound_lead_id, optional)
```

## Proposed action types (derived from the CHECK-constraint enums, not yet centralized)

| Action | Applies to | Effect | Guard |
|---|---|---|---|
| `qualifyLead` | InboundLead / OutboundLead | status → qualified | must have email or phone |
| `convertLeadToContact` | InboundLead / OutboundLead | creates/links Contact, sets `inbound_lead_id`/`outbound_lead_id` | status must be qualified |
| `openDeal` | Customer | creates Deal (stage: new) | Customer must exist |
| `advanceDeal` | Deal | stage transition | only forward transitions in the enum order, or → closed_lost |
| `bindPolicy` | Deal (closed_won) | creates Policy linked to Deal + Customer | deal.stage = closed_won |
| `renewPolicy` | Policy | new Policy row or renewal_date bump | policy.status = active, within renewal window |
| `logInteraction` | Customer/Contact/Deal | creates Interaction | at least one of customer_id/contact_id/deal_id set |
| `approveDraft` / `rejectDraft` | AIDraft | status → approved/rejected, optionally sends | status = pending |

These transitions already exist as CHECK constraints; the point of centralizing them as
actions is that today nothing stops a page from writing an invalid or off-vocabulary
status directly (as the Claims page already does).

## Gaps — not modeled yet

- **Claim** has no table. It's currently a filtered view over `InboundLead`, which means
  a claim can't carry claim-specific fields (loss date, adjuster, payout) without
  overloading the lead schema. Worth promoting to a real table once claims volume or
  fields outgrow what a lead row can hold.
- **Product/Coverage** is a free-text/enum field (`product_type`) on `deals` and
  `policies`, not an object of its own — no home for rates, wording, or PDS documents.
- **Insurer/Underwriter** is a text field on `policies`, not a linked object — can't
  attach insurer-level data (contact, commission terms) without a real table.

## Implementation path

1. Add `src/lib/ontology/` with one module per object type above (`customer.ts`,
   `policy.ts`, `deal.ts`, …), each exporting typed `get`/`list`/`link` reads and the
   action functions from the table above, wrapping `src/lib/supabase/client.ts` /
   `server.ts`. No schema changes required for this phase.
2. Migrate `src/app/claims/page.tsx` to call `inboundLead.list({ department: 'Claims' })`
   and the shared status enum instead of its local `STATUS`/`ALL_STATUSES` constants —
   this is the concrete first fix the drift above points to.
3. Only after that: decide whether Claim, Product, and Insurer earn their own tables,
   driven by actual field needs rather than upfront modeling.

## Extending this to Nexus / RFQ

The same drift problem exists on the Nexus side, across `src/app/nexus/`, `src/app/api/nexus/**`,
and the RFQ pipeline — it just hasn't been written down yet. Object types, from the
`supabase/migrations/` files (not yet folded into `full_schema.sql`):

| Object | Source table | Key properties | Status / lifecycle |
|---|---|---|---|
| Case | `cases` | name, description | status: open / closed / archived |
| CaseThread | `case_threads` | party_type, party_label | (link: Case ↔ EmailThread) |
| EmailAttachment | `email_attachments` | filename, mime_type, parsed_text | parsed_at set once extracted |
| CaseAnalysis | `case_analyses` | historical_timeline, current_status, playbook, outreach_strategy, legal_research | terminal — one row per completed Grand Analysis |
| AnalysisRun | `nexus_analysis_runs` | phase1_state, phase2_state, case_analysis_id | phase1_pending → phase1_running → phase1_done → phase2_running → phase2_done → phase3_running → completed / failed |
| ChatLearning | `nexus_chat_learnings` | email_type, question, answer | append-only |
| Insurer | `insurers` | name | status: active / inactive |
| InsurerContact | `insurer_contacts` | product_line, contact_name, contact_email | — |
| RfqRequest | `rfq_requests` | product_line, insured_name, summary, key_details | status: open / dispatched / quoted / recommended / selected / not_chosen / won / lost / closed |
| RfqDispatch | `rfq_dispatches` | insurer_name (snapshot), to_email (snapshot), ai_draft_id | status: drafted / sent / replied |
| RfqQuote | `rfq_quotes` | premium, excess, limit_indemnity, evidence (per-field source excerpt) | status: received / shortlisted / recommended / selected / not_chosen / won / lost / declined |
| RfqEvent | `rfq_events` | event_type, actor, summary, detail | append-only audit log — see below |

Link types:

```
Case         1──* CaseThread ──1 EmailThread (id only, no FK — email_threads is a separate table)
EmailThread  1──* EmailAttachment (via message_id → email_messages, no FK)
Case         1──* CaseAnalysis
Case         1──* AnalysisRun ── optional CaseAnalysis (nexus_analysis_runs.case_analysis_id)
Case         1──* ChatLearning
Case         1──* RfqRequest
RfqRequest   1──* RfqDispatch ── optional InsurerContact
RfqDispatch  1──1 RfqQuote                (unique per dispatch)
Insurer      1──* InsurerContact
RfqRequest / RfqDispatch / RfqQuote / Case ──* RfqEvent   (all FKs on RfqEvent are optional/loose, not enforced)
```

### The interesting part: `rfq_events` already *is* an ontology Action layer

`src/lib/rfq-log.ts` (`logRfqEvent`) writes one append-only row per RFQ touchpoint —
`requested | dispatched | replied | quoted | recommended | selected | not_chosen | reopened` —
each carrying the real ids, an actor (`user email` or `'system'`), and a `detail` blob. That is,
independently of anything Palantir-shaped, the exact same thing the
["Why Ontology"](https://www.palantir.com/docs/foundry/ontology/why-ontology) doc calls
**decision lineage**: "when a given decision was made, atop which version of data, and through
which application." It already exists for RFQ. It does not exist for `cases.status` or
`nexus_analysis_runs.status` — those two just get overwritten with no history of who/why/when.

So the concrete, low-effort move here (unlike the Logic/Action/Security pillars flagged as
out-of-scope above, which would be new work) is to **generalize what's already built**:

1. Rename/broaden `rfq-log.ts` into a shared `logEvent()` (or keep `rfq_events` as-is and add a
   parallel `case_events` table — cheaper, since `rfq_events.case_id` already exists and the
   table is loosely-FK'd by design) so `Case` status changes and `AnalysisRun` phase transitions
   get the same audit trail RFQ touchpoints already get.
2. Centralize the action functions implied by the status columns above
   (`openCase`/`closeCase`/`archiveCase`, `dispatchRfq`, `captureQuote`, `shortlistQuote`,
   `recommendQuote`, `selectQuote`/`rejectQuote`, `advanceAnalysisPhase`) into
   `src/lib/ontology/` alongside the CRM ones from Phase 1, each action both writing its row
   *and* logging the event — instead of routes writing `status` directly, which is the same
   drift pattern the Claims page had, just not yet visible as a bug here because RFQ's own
   event log happens to cover most of it already.
3. Everything else from the Palantir framing above (staged "scenarios" before write-back,
   Logic-layer binding for the Gemini/Claude calls in `run-nexus-analysis.ts`, marking-based
   Security) is still not warranted at this scale — noted here only so it isn't quietly
   reinvented piecemeal the way `rfq_events` was.

Sequencing this behind Phase 1 avoids designing objects for data that doesn't exist yet
— the risk flagged when scoping this doc.
