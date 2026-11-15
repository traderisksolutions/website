# Case sources, labels, relevance and case memory

Phase 1 of the case agents plan (management feedback, Nov 2026). The agents read only what a person put on the case, every email thread carries one label, older mail steps back, and what any agent or person learned stays on the case.

Status, 15 Nov 2026: data model, rules, stores and routes live on production (migration applied, 2,754 threads labelled by rule). Screens built to the approved journey v2, not deployed.

## Rules

1. A person's pick is the truth. A thread a person put on a case is never moved or removed by an agent; a thread a person took off a case is never put back on it by an agent.
2. One thread, one case. Picking a thread that sits on another case answers 409 with that case; `move: true` takes it and both cases record it.
3. Mail privacy holds everywhere. A thread in a colleague's mailbox is counted (`hidden`), never listed, never quoted; picking, excluding or labelling it answers 403. A note read from such a thread shows its text and withholds the quote.
4. Labels and relevance are code. No model is called anywhere in this module.
5. A note an agent leaves must quote an email on the case word for word, or it is dropped with the reason. A person's note needs no source.
6. Words belong to whoever wrote them. A quote found in a message's own text is its sender's; a quote found only in the history beneath is filed under the writer of that block (`quoteSource`); with no writer named it is left out.
7. Every write is idempotent: the same pick, the same turn or the same note twice changes nothing the second time.

## Data

Migration `supabase/migrations/20261115_case_sources.sql` (additive; safe to run twice).

| Table | What it holds |
| --- | --- |
| `email_threads.label`, `label_rule`, `label_basis`, `label_by`, `label_at` | The thread's label, what the rule said, what it matched on, and who set it (`rule` or a person's address). |
| `work_item_threads.joined_by = 'person'`, `joined_evidence` | A person's pick and who made it. Existing table. |
| `work_item_thread_excluded` | Threads a person took off a case, and who. |
| `work_item_notes` | Case memory: section, text, the quote and its email, author, status (current, superseded, rejected). |
| `work_item_reads` | Which agent has read which email of the case. |

## Labels (`src/lib/cases/labels.ts`)

`quotation_request`, `quote_received`, `renewal`, `claim`, `member_movement`, `endorsement`, `document`, `payment`, `other`.

`labelOf` reads the subject, first rule first: claim, endorsement, member movement, payment, an insurer's quotation file (quote received), renewal, quotation request, document. A cover's own name is not a claim ("Work Injury Compensation", "Group Hospitalisation & Surgical"); nor is a claims experience report. The rule runs when mail arrives (`depositMessages`) and can be re-run over any threads (`labelThreadsByRule`); it never overwrites a person's label, and keeps its own answer beside it in `label_rule`.

## Relevance (`src/lib/cases/relevance.ts`)

| Group | Rule |
| --- | --- |
| Member movements | Labelled member movement or endorsement. Kept apart for the year-end consolidation. |
| Back burner | Last message over 90 days ago, or not on an open case. |
| Active | Within 90 days and on an open case. |

Renewal season is on for a client when a policy ends within 90 days, or a renewal case is open.

## Sources of a case (`sources.ts`, `sources-store.ts`)

`loadSources(case, viewer)` answers: `picked` (with who picked each), `buckets.client` and `buckets.insurer` (what each side said, in date order, TRS's own messages marked `trs`, auto-replies left out, each message without its closing, signature and the history beneath), `proposed` (threads of the same client the case likely needs: policy number in the subject, then shared subject words, then a label that fits the case type), `recent`, `older` (over 90 days), `excluded` and `hidden`.

Proposals are computed on every load and never stored.

## Order by closeness (`similarity.ts`, `thread_vectors`)

Each thread has one vector, made from its subject and what its first three messages say themselves (`threadText`), by `scripts/embed-threads.mts` on a CPU with bge-small-en-v1.5. No model API is called. `rpc/thread_similarity(p_reference, p_candidates)` answers how close each candidate is to the centre of the reference threads: the threads the viewer sees on the case.

| List | Order |
| --- | --- |
| Proposed | Policy number, then subject, then label; inside each, closest first. |
| Recent | Closest first. |
| Older | Newest first. |

A thread with no vector comes after the scored ones, newest first. A case with no thread yet keeps newest first throughout. Similarity changes the order only: what is proposed, the reason shown and what a person picks are untouched.

Run `scripts/embed-threads.mts --write` after new mail to embed threads that are new or changed (37 ms a thread). The runtime is installed once in `tools/thread-embed/` (`npm ci --ignore-scripts`) and is not a dependency of the dashboard.

Measured 15 Nov 2026, hold-one-out on 521 threads of cases with two or more (links made by rules): in the first five offered 60.1% by rules alone, 75.2% with this order.

## Case memory (`memory.ts`, `memory-store.ts`)

Sections: Client said, Insurer said, Wish list, Risk, Success factor, Open question, Next step, Decision, Hand-over. One next step stands at a time; a newer one supersedes the older, which stays on record.

Every agent starts with `loadCaseState(case, { agent, viewer })`: the case, its emails, the notes, where it stands (`resume`: last touch, next step, open questions, hand-over, unread counts) and the emails that agent has not read. It ends with `recordTurn(case, agent, { evidence, notes, readThreadIds })`, which keeps the notes that pass, marks the emails read and writes one event. The case reader already does this (`storeCase`). A turn that left notes is written to the client's ledger as counts; a person's note is written in its own words.

## Routes

Every route needs a signed-in TRS person; the scheduler has no view of mail.

| Route | Does |
| --- | --- |
| `GET /api/work/:id/sources` | The sources of a case. |
| `POST /api/work/:id/sources` | `{ action: pick, exclude, restore or side, thread_id, move?, side? }`; answers the sources as they then stand. |
| `GET /api/work/:id/memory` | The nine sections, notes set aside, where the case stands, the emails without their bodies. |
| `POST /api/work/:id/memory` | `{ action: note, section, text, message_id? }`, or `{ action: reject or restore, note_id }`. |
| `POST /api/work/:id/read` | The case reader on this case's threads; answers `{ ok, notes, read }`. Started by a person only. |
| `GET /api/today/mail` | Labelled threads the person may see, with company, label, who set it and the open case. |
| `POST /api/threads/:id/label` | `{ label }`: a person's label. |
| `GET /api/companies/:id/relevance` | A client's threads by group, the hidden count and renewal season. |

Statuses: 401 no TRS session, 400 bad input, 403 a colleague's thread, 404 unknown case, thread or note, 409 a thread on another case or a note already on the case.

## Dogfood

`scripts/dogfood-case-sources.mts` seeds two companies, eight threads and two cases on `.invalid` domains under fixed ids, walks every store function (`lib`, 91 checks) and every route (`http <base>`, 54 checks), removes the records and verifies none are left. It refuses a database that is not local unless `--live` is given. No model is called.

Run of 15 Nov 2026 on production (`--live`, test records removed): 88 of 88 and 37 of 37; 91 of 91 with the order by closeness; 54 of 54 on the routes with Today mail and the read a person starts.

Found by the run and fixed: a quotation request for Work Injury Compensation was labelled a claim; a message's sender was counted among its recipients; a repeated note wrote a second event.

## Screens

| Screen | Where | Shows |
| --- | --- | --- |
| Today › Mail | `/today?view=mail` (`MailView.tsx`, `GET /api/today/mail`) | Labelled threads the person may see: Thread, Company, Label, Set by, Last message, Case. Relevance and label filters; the label is changed in the row. |
| Company › Threads | `/companies/:id?tab=threads` (`CompanyThreadList.tsx`) | List by relevance; `&view=reader` is the two-pane reader. |
| Case › Overview | `/today/:id` | The draft, then Resume point and Agents (`ResumePoint.tsx`). The rail shows on Overview only. |
| Case › Sources | `?section=sources` (`CaseSourcesPanel.tsx`) | Proposed, Recent, Over 90 days, On case, Removed. Tick, set the side, Add. A thread on another case opens `MoveThreadDialog`. |
| Case › Conversation | `?section=conversation` (`CaseConversation.tsx`) | Client table above Insurer table: Date, From, Message, Files. |
| Case › Brief | `?section=brief` (`CaseBrief.tsx`) | Notes with their source; Set aside, Restore, Add note. |

A panel that changes the case refreshes the page's events and threads without reloading the draft, so words typed in the draft survive.

## The read a person starts (`POST /api/work/:id/read`, `workCase`)

"Read N new emails" is the one button that sends a case to a model. It takes the threads on the case that the person may see and nothing else of the client, keeps the notes that quote those emails, and records which emails were read. It answers 400 for a closed case, a case with no client, no thread or no email. It never closes the case and never changes its client, kind or title (`personsCaseRow` in `src/lib/casework/clean.ts`): when the reader finds the matter complete, the Decision slot says so and the person closes it. It writes no draft.

The whole-client read (the queue, run from Today › AI approvals) still takes mail on no case, so new mail can become a case. In renewal season it leaves out member movements and endorsements on no open case (`leftOutInSeason`).

## Not built yet

- A classifier trained on labels people set (SetFit): waits for person-set labels.
- The autonomy measure on `/analytics/autonomy`.
- Vectors for new threads without a manual run of `scripts/embed-threads.mts`.
