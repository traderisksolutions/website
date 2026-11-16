# Case sources, labels, relevance, case memory, the brief, document checklists and rounds

Phase 1 of the case agents plan (management feedback, Nov 2026). The agents read only what a person put on the case, every email thread carries one label, older mail steps back, and what any agent or person learned stays on the case.

Status, 15 Nov 2026: data model, rules, stores, routes and the journey v2 screens live on production (migration applied). The five-tier label rules below are live (7bb57340) and all 2,754 threads were relabelled by them the same day: 747 labels changed, none set by a person.

Live the same day (6cbf02a5): the brief in five parts with a document checklist per line (phase 2, below), and Today › Mail loading a page at a time. Their two migrations are applied to production and are additive. The nightly job that embeds new threads is running.

Live 16 Nov 2026: the manual journey (Combine on Today › Mail and Home › Mail, a named insurer per thread, Run on Rounds, the basic documents and Files). Its migration, `20261116_manual_journey.sql`, is additive and applied to production.

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
| `work_item_threads.insurer_company_id` | The insurer on file a person named for an insurer-side thread. Empty for every other side. Migration `20261116_manual_journey.sql`. |
| `work_item_thread_excluded` | Threads a person took off a case, and who. |
| `work_item_notes` | Case memory: section, text, the quote and its email, author, status (current, superseded, rejected). `need` grades a wish `must` or `nice`; empty is not graded. Migration `20261116_renewal_compare.sql`. |
| `work_item_comparisons` | One row per case: the options, the term rows with a cell per option, each wish's mark per option, the option recommended and the reason, who saved it and when. Same migration. |
| `work_item_reads` | Which agent has read which email of the case. |
| `line_checklists` | One row per list: the basic list (`basic`) and one per line of insurance that has a list. Who confirmed it and when, who last edited it. Migration `20261115_case_brief.sql`. |
| `line_checklist_items` | The documents of a list: name, how it is found (`file`, `wish`, `person`), document types, words a file name carries, `required` (false is Optional), position, active. |
| `work_item_checklist` | A person's calls on one document of one case: confirmed or not needed, the file confirmed, the files turned down, who and when. What code finds is never stored. |
| `work_items.product_line`, `product_line_by` | The line of insurance a person chose for the case, and who. |
| `rpc/today_mail` | Today › Mail in one query: counts per relevance and the newest rows. Migration `20261115_today_mail.sql`. |

## Labels (`src/lib/cases/labels.ts`)

`quotation_request`, `quote_received`, `renewal`, `claim`, `member_movement`, `endorsement`, `document`, `payment`, `other`.

`labelOf` reads five things in order; the first rule that matches wins and its basis is stored in `label_basis`.

| Tier | What is read | Result |
| --- | --- | --- |
| 1 | The subject | Claim, endorsement, member movement, payment, an insurer's quotation file (quote received), renewal, quotation request, document. An automatic reply, a recall, a maintenance notice or an announcement is Other. |
| 2 | A subject that is not casework (circular, webinar, invitation, booking, meeting, training, survey, password) or a thread only automated senders wrote | Other; nothing below is read. |
| 3 | The first email's own words (`ownText`, first 600 characters, read for the label and never stored) | Claim, endorsement, member movement, payment, a request for terms (quotation request), renewal, quotation, document. From an insurer the words must be the point of the email ("renewal notice", "pleased to quote"), because its footers say "renewal" and "quotation". |
| 4 | The file names on the thread | A medical or police report is a claim; a proposal form, ACRA profile or financial statement from a client or TRS is a quotation request; an invoice, debit note or payment advice is a payment; a name list is a member movement. A signature picture is not a file. |
| 5 | A cover named in the subject of a thread no insurer started | Quotation request. |

A cover's own name is not a claim ("Work Injury Compensation", "Group Hospitalisation & Surgical"); nor is a claims experience report. A request to an insurer for terms is a quotation request even when it names the expiring policy, because a quotation request is offered to renewal and new-quote cases alike. The rule runs when mail arrives (`depositMessages`) and can be re-run over any threads (`labelThreadsByRule`, `scripts/label-backfill.mts`); it never overwrites a person's label, and keeps its own answer beside it in `label_rule`.

Measured offline on the 2,754 threads of 15 Nov 2026 (no model):

| Label | Subject only | Five tiers |
| --- | --- | --- |
| Quotation request | 116 | 461 |
| Quote received | 83 | 92 |
| Renewal | 230 | 272 |
| Claim | 308 | 402 |
| Member movement | 62 | 119 |
| Endorsement | 11 | 54 |
| Document | 222 | 104 |
| Payment | 165 | 265 |
| Other | 1,557 | 985 |

Of the 985 left on Other, 449 are held back as not casework and 523 match no rule. Known weak spots from reading samples: a vendor's own quotation or invoice reads as TRS casework; a first email that mentions a renewal in passing (a claims history, a list of policies) reads as renewal.

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

A thread on a case has a side: client, insurer, internal or other. An insurer-side thread can name the insurer on file it is with (`setSide(case, thread, side, actor, insurerId)`, kept in `work_item_threads.insurer_company_id`); the list is every company of kind insurer or third-party administrator. A named insurer stands over the company the thread is filed under and over its subject when Rounds groups the thread's emails (`threadNamed`). Any other side clears the name.

## Combine (`combine.ts`, `combine-store.ts`, `CombineDialog.tsx`)

The manual journey, step 1. A person ticks threads on Today › Mail and presses Combine; nothing is made until Start case or Add to case. No model is called.

| The form opens with | From |
| --- | --- |
| Client | The client most of the ticked threads are filed under or linked to (`clientAmong`); a person can choose another or add one. |
| Case | New case, or one of that client's open cases. |
| Kind | The kind most of the threads' labels point to (`caseTypeAmong`); a renewal among them makes a quotation a renewal; Other when no label points to a kind. |
| Title | The oldest thread's subject without its reply and forward marks, 140 characters at most (`titleAmong`). |
| Side per thread | Insurer with its name when the thread is filed under an insurer or administrator, or is an insurer's thread about this client; Client when it is filed under the client; else Other (`fromOfThread`). The person changes any of them. |

`combineThreads` starts the case with a `started` event, or takes the open one, then picks each thread and sets its side through the same store calls as Case › Sources, so the rules hold: one thread, one case (409 with `conflicts` unless the thread is listed in `move`; the button names the move), a colleague's thread answers 403, the same call twice changes nothing. A new case with no thread attached is removed. 40 threads at most in one call.

## Order by closeness (`similarity.ts`, `thread_vectors`)

Each thread has one vector, made from its subject and what its first three messages say themselves (`threadText`), by `scripts/embed-threads.mts` on a CPU with bge-small-en-v1.5. No model API is called. `rpc/thread_similarity(p_reference, p_candidates)` answers how close each candidate is to the centre of the reference threads: the threads the viewer sees on the case.

| List | Order |
| --- | --- |
| Proposed | Policy number, then subject, then label; inside each, closest first. |
| Recent | Closest first. |
| Older | Newest first. |

A thread with no vector comes after the scored ones, newest first. A case with no thread yet keeps newest first throughout. Similarity changes the order only: what is proposed, the reason shown and what a person picks are untouched.

New and changed threads are embedded every night at 01:00 Singapore time by the Cloud Run job `thread-embed` (project `trs-ai-project`, asia-southeast1; 2 CPU, 2 Gi, 30-minute limit), started by a Cloud Scheduler entry of the same name. The job runs as its own service account, which may read the database key and start this job and nothing else; it holds no key file and no `CRON_SECRET`. `npm run embed:run` starts the same job on demand and waits for it. `tools/thread-embed/deploy.sh` builds the image (`tools/thread-embed/Dockerfile`) and creates or updates the job and its schedule. A run with nothing new takes about 25 s.

The same text embedded on a Mac and in the job gives vectors 0.998 alike (cosine), so the two can be mixed. `scripts/embed-threads.mts --write` still runs by hand (37 ms a thread); the runtime is installed once in `tools/thread-embed/` (`npm ci --ignore-scripts`) and is not a dependency of the dashboard.

Measured 15 Nov 2026, hold-one-out on 521 threads of cases with two or more (links made by rules): in the first five offered 60.1% by rules alone, 75.2% with this order.

## Case memory (`memory.ts`, `memory-store.ts`)

Sections: Client said, Insurer said, Wish list, Risk, Success factor, Open question, Next step, Decision, Hand-over. One next step stands at a time; a newer one supersedes the older, which stays on record.

Every agent starts with `loadCaseState(case, { agent, viewer })`: the case, its emails, the notes, where it stands (`resume`: last touch, next step, open questions, hand-over, unread counts) and the emails that agent has not read. It ends with `recordTurn(case, agent, { evidence, notes, readThreadIds })`, which keeps the notes that pass, marks the emails read and writes one event. The case reader already does this (`storeCase`). A turn that left notes is written to the client's ledger as counts; a person's note is written in its own words.

## The brief (`brief.ts`, `brief-store.ts`)

Phase 2 of the plan: the brief holds only what a person needs to send the next email, in five parts and this order.

| Part | What it holds | Read from |
| --- | --- | --- |
| Communicated | The last email TRS sent the client, and the last it sent each insurer. | The emails on the case's threads; automatic replies and TRS-only emails left out. |
| Client wish list | What the client asked to keep or to have. | Current Wish list notes. |
| Known risks and success factors | Only those a client or an insurer stated. | Current Risk and Success factor notes. An agent's note stays only when the words it quotes were written by the client or an insurer; one resting on TRS's own words is left off and counted (`left_off`). A person's note always stays. |
| Open questions | Who owes whom an answer, and since when. | Current Open question notes, oldest first. The writer of the quoted words is the one waiting: a client's or an insurer's words mean TRS owes; TRS's words on a client thread mean the client owes, on an insurer thread that insurer. |
| Next step | The one action, and the agent that drafts it. | The standing Next step note, else the case's `next_action`. Placement drafts when the case has a placement, no agent drafts for a claim, Relay otherwise. |

Every row carries its source email; a row with none (a person's own note, a next step taken from `next_action`) is counted as `unsourced`. Words from a colleague's mailbox are withheld and the row marked private. No model reads anything: the notes are those the case reader or a person already left.

## Document checklists (`checklist.ts`, `brief-store.ts`)

The basic list (`basic`, "Basic documents") applies to every renewal and new-quote case. A line of insurance can hold a list of its own, shown before the basic one on a case of that line; a document already on the line's list is not repeated (`caseItems`). Lists are held in Settings › Document checklists. A claim has none. It is not the binding gate (`src/lib/admin/b/documents/gate.ts`), which is untouched.

The case's line is a person's choice, else the policy's line or class, else what the title says (`caseLine`). Group health and group personal accident share the Employment Benefits list.

| Found by | A document is Found when |
| --- | --- |
| A file on the case | A file on the case's threads has one of the item's document types (`classifyByName`) or one of its words in the name. The newest such file is offered. |
| Client wish on the brief | The brief holds a client wish. |
| A person only | Never by code; a person confirms it. |

Status on a case: Missing, Found, Confirmed, Not needed. A person's call stands over what code finds. "Not this file" keeps the file on a turned-down list for that case and offers the next. Only a person's calls are stored.

Each document is Required or Optional (`required`). The list is complete when no Required document is Missing; an Optional one never holds it back. The heading counts the required documents ("Documents · 2 of 3 required").

A list applies to a case as it stands, confirmed or not (16 Nov 2026: a case takes whatever the list holds; before, an unconfirmed list showed as a draft on the case). Settings still records who confirmed a list and when. A document is retired, not deleted, so calls already made stay on record. Five line lists were seeded on 15 Nov (Employment Benefits, group travel, commercial vehicle, directors and officers, work injury compensation). The basic list is seeded with last year's policy schedule and claims history as Required and the authorisation form as Optional.

Files (`caseFiles`): under Documents, every case of every kind lists the files on its emails (File, Type, From, Date), newest first, whether a list asks for them or not. A file in a colleague's private thread shows no name.

Measured on production, 15 Nov 2026 (no model):

| Open renewal and new-quote cases | Count |
| --- | --- |
| All | 278 |
| Line from the policy | 6 |
| Line from the title | 184 |
| No line until a person chooses | 88 |
| On one of the five drafted lists | 85 |

## Rounds (`rounds.ts`, `rounds-store.ts`, `rounds-draft.ts`, `src/lib/crm/party-read.ts`)

Phase 3 of the plan, first part: who is owed what next on a case, worked out from the emails on its picked threads on every read. Nothing is stored but a person's calls. No model is called.

Every email is one move.

| Writer | Moves |
| --- | --- |
| Client | Request, Change, Answer, Question, Documents, Instruction, Follow-up, Message |
| Insurer | Quote, Question, Decline, Reply, Documents, Follow-up, Message |
| TRS | Sent to insurer, Sent to client, Follow-up, Message |

Who wrote an outside email, in this order: the company its domain is filed under; the sender read (`party-read.ts`); the side of the thread. A thread whose side a person set is not moved by the sender read. TRS's own email goes by who it was written to.

The sender read places the senders the domain map cannot: a personal address, a domain not on file, a business that refers clients.

| Read | Rule |
| --- | --- |
| Address | The domain's own name is a company on file. Public mailboxes name no one. |
| Signature | The block under the closing names a company on file, or carries its web address. |
| Voice | "our client", "the HR has added" is a referral; "your client", "our proposal", "the insured" is the market. Both or neither reads as nothing. |

The address and the signature name the company; the voice names only the side. One read per sender across their emails on the case: a named company beats a voice. A referral's emails are the client's words, marked with the referral's name; the round's heading names the referral.

### A referral marked on one thread (`src/lib/crm/thread-referral.ts`)

The Inbox rail shows a Referral row under From when the rules read a referral among the thread's senders, or a person has marked the thread. Tag as referral and Not a referral store the person's call for that thread alone (`app_settings`, key `thread_referral:<thread id>`); Remove or Undo deletes it. The company the thread is filed under keeps its kind, and the thread does not move. Rounds read the mark: a tagged thread's client-side emails carry the referral's name where the sender names none, and Not a referral clears the rule's reading on that thread.

| Sender | Reads as a referral when |
| --- | --- |
| At the domain of a referral a person has checked | Always, unless the sender writes in the market's voice. |
| At the domain of a referral nobody has checked | The sender also writes in a referral's voice. |
| At no domain on file, or a personal address | The address name, the signature or the voice says so (the table above). |

No row shows on a thread filed under a referral, an insurer or a third-party administrator. Measured on production, read-only, on the 266 latest threads filed elsewhere: 43 suggestions with every referral's domain counted, 8 with the checked rule (address 5, voice 2, signature 1).

### Referrals review (`src/lib/crm/referral-review.ts`, Today › Unfiled threads › Referrals)

Every company of kind referral in one table, unchecked first, then by threads: company, domains (with any other company holding the same domain), threads, emails from TRS, the last email, how its senders read on its five latest threads (Referral, Market), Kind and Checked. Choosing a kind, or Keep, sets the kind and marks the company checked (`PATCH /api/companies/:id { kind, confirmed: true }`). A checked referral is what the rail's address reading rests on. A subject in a colleague's mailbox is withheld.

A domain held by a company of kind other (a billing sender, a regulator) is not a client's own: mail from it is left for a person, and no second company is made from it (`buildCompanyIndex`).

Round 1 is the first request. A new round opens when the client changes the request after TRS has written to an insurer in the current round. Every insurer asked so far, and not declined, is owed the change. Inside a round each insurer is one chain: to ask, asked, heard, replied, sent to client, declined.

The next steps are the links not yet made, in the order they block the case.

| Step | To | Drafted by | Template |
| --- | --- | --- | --- |
| The client's change, answer, question, documents or instruction, per insurer | Insurer | Insurer agent | `forward_change`, `forward_answer`, `forward_question`, `forward_documents`, `forward_instruction` |
| An insurer's terms, questions, decline, reply or documents | Client | Client agent | `relay_quote`, `relay_question`, `relay_decline`, `relay_decision`, `relay_documents` |
| Ask insurers for terms (a renewal or new quote with no insurer written to) | Insurer | none | Opens the thread |
| Waiting on an insurer, or on the client | none | none | Opens the thread |

A person's call on one email (who wrote it and what it is) replaces the rule's reading for that email and is kept as a case event of kind `move`; the latest call wins and "Rule" hands the email back. TRS's own email stays TRS's.

Draft (`draftStep`) writes one step's email from its template (`src/lib/admin/b/relay/compose.ts`) in the other side's own words, with the files of the email it rests on. It goes to whoever last wrote on that side of the case, else whoever TRS last wrote to there, on that thread. Copied: an insurer's colleagues at the same domain, or everyone on the client's email who is not at an insurer. The draft is the case's unsent email when the case has none, and sits beside it otherwise. It records the agent (`client_agent` or `insurer_agent`), the step and the email it rests on in `ai_drafts.context_used`, so the share sent as written can be counted per agent. The same step twice makes one draft. A person edits and sends it from Overview; nothing sends from Rounds.

Run (`runSteps`) is the manual journey, step 2: it drafts every next step that has an email, one after another, by the same `draftStep`. It answers `{ made, existing, skipped: [{ step, reason }] }`: a step already drafted is counted, not drafted twice; a step that cannot be drafted is passed over with its reason. A closed case answers 400. Nothing sends, and no model is called.

Measured on production, 16 Nov 2026 (read-only): 539 open cases, 403 with emails; 18 hold more than one round (the most is 22, weekly member movements); 354 steps to act on across 212 cases, of which 312 draft an email and 42 name no insurer to write to, and 97 steps that wait. TRS wrote to the same side after the email on 44 of the 354, 36 of them among the 42: those cases have no insurer thread attached. Read by hand, 30 sampled steps: 16 exactly right, 25 with the right recipient, 5 wrong; the rules were tightened after the sample and it was not repeated. The sender read placed 108 of the 280 senders the domain map leaves unplaced.

## Routes

Every route needs a signed-in TRS person; the scheduler has no view of mail.

| Route | Does |
| --- | --- |
| `GET /api/work/:id/sources` | The sources of a case. |
| `POST /api/work/:id/sources` | `{ action: pick, exclude or restore, thread_id, move? }`, or `{ action: side, thread_id, side, insurer_id? }` where `insurer_id` names the insurer on file; answers the sources as they then stand. |
| `GET /api/work/combine?threads=a,b,c&company=` | What Combine opens with: each thread's side, named insurer and the case that holds it, the insurers on file, the client and its open cases, a kind and a title. Writes nothing. |
| `POST /api/work/combine` | `{ company_id, case_type, title, threads: [{ id, side, insurer_id? }], move? }` starts a case; `{ work_item_id, threads, move? }` adds to an open one. Answers `{ id, created }`. |
| `GET /api/work/:id/memory` | The nine sections, notes set aside, where the case stands, the emails without their bodies. |
| `POST /api/work/:id/memory` | `{ action: note, section, text, message_id? }`, or `{ action: reject or restore, note_id }`. |
| `POST /api/work/:id/read` | The case reader on this case's threads; answers `{ ok, notes, read }`. Started by a person only. |
| `GET /api/work/:id/brief` | The brief in five parts, the case's line of insurance and its document checklist. |
| `POST /api/work/:id/brief` | `{ action: confirm, not_needed, reject or clear, item_id }`: a person's call on one document. `{ action: line, line }`: the case's line (null clears the choice). |
| `GET /api/work/:id/rounds` | The rounds: every email as one move, each insurer's chain, the next steps and the unsent email already made for a step. No email bodies beyond each email's own words. |
| `POST /api/work/:id/rounds` | `{ action: draft, step }` writes the step's email and answers the rounds with `made`; `{ action: run }` drafts every step owed and answers the rounds with `ran`; `{ action: move, message_id, by, move }` is a person's call on one email (both null hand it back to the rule). |
| `GET /api/settings/checklists` | Every line's list with its documents, the document types and the staff names. |
| `POST /api/settings/checklists` | `{ action: list, line }` starts a list; `{ action: item, line, label, found_by, doc_types, words, required? }` adds a document; `{ action: confirm, line }` confirms the list. |
| `PATCH /api/settings/checklists` | `{ id, label?, found_by?, doc_types?, words?, required?, active? }` edits or retires a document. |
| `GET /api/today/mail?relevance=&label=&limit=` | The count per relevance under the label filter and the newest `limit` rows (200 by default, 20,000 at most) the person may see, with company, label, who set it and the open case. One database call (`rpc/today_mail`). |
| `POST /api/threads/:id/label` | `{ label }`: a person's label. |
| `GET /api/engagement/thread/:id/referral` | `{ tag, suggestion }`: the person's mark on the thread and the rules' reading of its senders. |
| `POST /api/engagement/thread/:id/referral` | `{ referral: true, false or null }`: tag, not a referral, or hand back to the rule. |
| `GET /api/companies/referrals` | `{ rows, unchecked }`: the referrals review. |
| `GET /api/companies/:id/relevance` | A client's threads by group, the hidden count and renewal season. |
| `GET /api/renewal-season` | `{ rows, today, window, months }`: the Renewal Season list. Writes nothing. |
| `POST /api/renewal-season` | `{ policy_id }` opens the renewal case for a policy, or answers the open one; `{ id, created }`. |
| `POST /api/work/:id/memory` | `{ action: note, section: wish, text, need? }` adds a wish with its grade; `{ action: need, note_id, need }` grades one (`must`, `nice` or null). |
| `GET /api/work/:id/compare` | `{ item, group, comparison, saved, wishes, files, withheld, staff }`: the saved comparison, or a new one with the terms of the case's line. Writes nothing. |
| `PUT /api/work/:id/compare` | `{ comparison }` saves it, bounded by `cleanComparison`; a source document must be a file on the case. |
| `GET /api/work/:id/compare/summary` | The saved comparison as a PDF; 404 until one is saved. |

Statuses: 401 no TRS session, 400 bad input, 403 a colleague's thread, 404 unknown case, thread, note, list or document, 409 a thread on another case, a note already on the case, a document already on the list, an empty list confirmed, or a finding turned down when there is none.

## Dogfood

`scripts/dogfood-case-sources.mts` seeds three companies, eleven threads and two cases on `.invalid` domains under fixed ids, walks every store function (`lib`, 220 checks) and every route (`http <base>`, 129 checks), removes the records and verifies none are left. The Combine walk starts a case from three ticked threads, names an insurer on a thread whose sender no company on file owns, presses Run (two emails to the client, one per insurer, a second Run writing none) and checks every refusal leaves no case behind. The checklist checks start a list on a line that has none and remove it; the lists staff keep are read, never written, and compared before and after. It refuses a database that is not local unless `--live` is given. No model is called.

Run of 15 Nov 2026 on production (`--live`, test records removed): 88 of 88 and 37 of 37; 91 of 91 with the order by closeness; 54 of 54 on the routes with Today mail and the read a person starts. With the brief, the checklists and Today mail by page: 154 of 154 on the stores and 90 of 90 on the routes. The stores walk also compares `rpc/today_mail` with the code rules (`mailView`) for every mailbox on file, a person with none, a colleague and the scheduler: 320 views, all equal.

Run of 16 Nov 2026 on production with the rounds (`--live`, test records removed): 182 of 182 on the stores and 109 of 109 on the routes.

Found by the run and fixed: a quotation request for Work Injury Compensation was labelled a claim; a message's sender was counted among its recipients; a repeated note wrote a second event.

## Screens

| Screen | Where | Shows |
| --- | --- | --- |
| Today › Mail | `/today?view=mail` (`MailView.tsx`, `GET /api/today/mail`) | Labelled threads the person may see: a tick box, Thread, Company, Label, Set by, Last message, Case. Ticked threads open Combine (`CombineDialog.tsx`): Client, Case, Kind, Title, then Thread, Side, Filed under, Last message, On case. Relevance and label filters; the label is changed in the row. The newest 200 rows load first; "Show N more" adds 200. |
| Home › Mail | `/` (`HomeMail.tsx`, `GET /api/today/mail?relevance=active`) | The newest 15 active threads: a tick box, Company, Thread, Label, Source (the rule's basis, or the person who set the label). A thread opens in the Inbox. Ticked threads open Combine ("Next steps for N threads"); the case opens on Rounds. |
| Today › Renewal Season | `/renewal-season` (`SeasonTable.tsx`, `ThreadPicker.tsx`, `GET /api/renewal-season`) | One row per policy ending in the window: Client, Policy, Ends, Stage, Conversations, Wish list, Documents, Compare, and Start, Select conversations or Open. Month and Line filters. Select conversations lists the client's threads by group (a tick box, Thread, Label, Last message, On case) and continues into Combine on the row's case. The Wish list count opens the wish list (`WishListDialog.tsx`: Wish, Need, By, Set aside; Add wish). |
| Company › Threads | `/companies/:id?tab=threads` (`CompanyThreadList.tsx`) | List by relevance; `&view=reader` is the two-pane reader. |
| Case › Overview | `/today/:id` | The draft, then Resume point and Agents (`ResumePoint.tsx`). The rail shows on Overview only. |
| Case › Sources | `?section=sources` (`CaseSourcesPanel.tsx`) | Proposed, Recent, Over 90 days, On case, Removed. Tick, set the side (Client, an insurer by name, Internal, Other: `SideSelect.tsx`), Add. A thread on another case opens `MoveThreadDialog`. |
| Case › Conversation | `?section=conversation` (`CaseConversation.tsx`) | Client table above Insurer table: Date, From, Message, Files. |
| Case › Rounds | `?section=rounds` (`CaseRounds.tsx`) | Run, the one primary button, drafts every step owed. Next steps (Step, Since, Drafted by, and Draft, Open draft or Open thread). Then one round at a time: its insurers (Insurer, Asked, Replied, Sent to client, State) and its emails (Date, From, Insurer, Type, Message, Files). Type is a list a person can change. |
| Case › Brief | `?section=brief` (`CaseBrief.tsx`, `CaseBriefTables.tsx`) | Tabs Brief, Notes, Set aside. Brief: the five parts in one table (Part, Item, Who, Date, Source), then on a renewal or new quote the line of insurance and Documents (Document, Need, Status, File, By, Action), then on every case Files (File, Type, From, Date). Notes: every note with its source; Set aside, Restore, Add note. |
| Case › Comparison | `?section=comparison` (`CaseComparison.tsx`), renewal cases only | Save is the one primary button; Client summary opens the PDF. Options (Option, Insurer, Source document), Policy terms (Term, then one column per option; Premium before GST last), Client wish list (Wish, Need, then one column per option; Must have met), Recommendation (Recommended option, Reason). |
| Settings › Document checklists | `/settings?section=checklists` (`ChecklistPanel.tsx`) | The basic list, then one table per line: Document, Need, Found by, File name says, Action. Add document, Edit, Retire, Confirm list; Add list for a line that has none. |

A panel that changes the case refreshes the page's events and threads without reloading the draft, so words typed in the draft survive.

## Renewal Season (`season.ts`, `season-store.ts`)

The list a person works renewals from, by hand. No model is called and nothing is stored: every figure is read from the policy register and the cases.

- **Window**: policies ending from 30 days back (`SEASON_BACK_DAYS`) to the end of the third month ahead (`SEASON_MONTHS_AHEAD`), on Singapore's date. Left out: endorsements, policies not bound, live or due for renewal, companies that are not clients, and a policy whose next term is on the register (same client, line and insurer, starting within 45 days of the end).
- **Case per policy** (`pairCases`), in four passes over the client's open renewal cases: the case linked to the policy; the case that names the policy number; the case on the same line of insurance; the client's only open case beside its only listed policy. A case linked to a policy outside the list still pairs by number or line. Each case pairs once.
- **Rows without a policy** (`keepsOwnRow`): an open renewal case no policy takes keeps a row unless it is at policy issue or billing, or its deadline falls outside the window.
- **Line**: Employment Benefits or General. The policy's known line decides; without one, the Employment Benefits flag or the wording does. Foreign worker medical is General.
- **Counts**: Conversations is the threads on the case, less the removed. Wish list is the notes in the wish-list section. Documents is required documents on file out of required, by the Brief's own rule (`checklistState`).
- **Compare**: Compare cover when the client's latest census quotation is analysed, New quotation for Employment Benefits without one, the case's Comparison for a general line with a case (with the number of options saved), else nothing.
- **Start** (`startRenewal`): returns the open renewal case on the policy, or opens one: title from the policy, deadline its end date, stage Request, start point Renewal, the person as owner. One event, `started`.
- **Select conversations** groups by `pickGroupOf`: member movements by label, back burner by age, the rest active. On Today › Mail a thread is active only once it is on an open case; here the person is choosing what goes on the case, so age and label alone decide.

## Comparison (`compare.ts`, `compare-store.ts`, `compare-summary.ts`)

How a person compares the offers on a renewal, by hand. Code lays the cells side by side and does the arithmetic; no model reads a brochure.

- **Options**: the current policy is always first and cannot be removed; up to four offers follow (five columns, `OPTIONS_MAX`). Each has a name, an insurer and one source document, chosen from the files on the case's threads. A file in a colleague's mailbox is counted and its name withheld; a saved choice the person cannot see is kept as it was (`keepFiles`).
- **Policy terms**: `newComparison` opens with the terms of the line group. General: scope of cover, sum insured or limit, sub-limits, excess, extensions, exclusions, conditions and warranties, period. Employment Benefits: hospital ward, annual limit, pre-existing conditions, outpatient, panel and non-panel clinics, exclusions, underwriting terms, period. A person adds, renames and removes terms, up to 30 rows of 500 characters a cell.
- **Premium**: the last row, typed per option. `premiumLines` reads the amount (`amountOf`) and works out the change from the current policy in dollars and per cent; a cell that is not an amount is kept as words and has no change.
- **Wish list**: the case's current wishes, must-have first (`byNeed`). A person marks each option Met, Partly met or Not met; `wishCounts` counts the must-have wishes met per option. Marks on a wish that was set aside are dropped at the next save.
- **Recommendation**: one option and a reason of up to 1,200 characters.
- **Save** (`saveComparison`) passes everything through `cleanComparison`, upserts `work_item_comparisons` and writes one event, `comparison`. Typing that is not saved stays in the page while the person looks at another section, and the browser warns before the tab closes.
- **Client summary** (`summaryModel`, `CompareSummaryDocument`): the saved comparison on the TRS letterhead, A4 landscape, one table per section: Recommendation, Premium, Policy terms, Client wish list, Source documents. A term blank for every option is left out. The page fetches the PDF and shows it in a dialog with Download.

## The read a person starts (`POST /api/work/:id/read`, `workCase`)

"Read N new emails" is the one button that sends a case to a model. It takes the threads on the case that the person may see and nothing else of the client, keeps the notes that quote those emails, and records which emails were read. It answers 400 for a closed case, a case with no client, no thread or no email. It never closes the case and never changes its client, kind or title (`personsCaseRow` in `src/lib/casework/clean.ts`): when the reader finds the matter complete, the Decision slot says so and the person closes it. It writes no draft.

The whole-client read (the queue, run from Today › AI approvals) still takes mail on no case, so new mail can become a case. In renewal season it leaves out member movements and endorsements on no open case (`leftOutInSeason`).

## Not built yet

- Comparison: a draft email to the client with the summary attached, and a read of a brochure into the term cells (a person's button, by the AI rule). Every cell is typed today.
- The automatic layer (journey 2): a model that selects a case's threads, sets their sides and runs the steps. Every step of the manual journey is a person's click today.
- Rounds: the case agent that decides between the client agent and the insurer agent with a model, and the share of drafts sent as written per agent on `/analytics/autonomy`.
- Referral marks live in `app_settings`, so the Inbox list cannot filter on them; a column on `email_threads` would allow it.
- Rounds: an insurer's follow-up and a third-party administrator's reminder can read as a question or as terms; a client's answer with no insurer named is offered to every insurer asked. A person's Type corrects one email.
- A classifier trained on labels people set (SetFit): waits for person-set labels.
- The autonomy measure on `/analytics/autonomy`.
- The brief does not yet replace the Summary on Overview; both show.
- A complete checklist does not yet stop an agent reading other threads, and a confirmed list is not yet given to the case reader as context.
- A document in the company's data room does not tick a checklist item; only files on the case's threads do.
- Wish notes are one list: no split between what must be kept and what would be good to have.
- A button in the dashboard for the embedding run; it is started by the schedule or `npm run embed:run`.
