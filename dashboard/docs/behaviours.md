# Behaviours register

Purpose: the one written record of every behaviour Jarod and the TRS brokers (Nathan, Ernest, Hasya, Angela) asked for, so a refactor cannot drop one silently.
How to use: every PR names the IDs it touches. A refactored page keeps every ID listed for its route, or the PR records the removal and Jarod's go.
Date: first draft, 12 Nov 2026, read against git to f4b1bb14. Where sources disagree the latest wins and the row says "replaces <date>".
Legend: [Standing] = Jarod called it a standing rule, or said "never" or "always". "Must not" rows are rejected patterns. [Open] = asked or known defect, not built.
Sources: CL <date> = docs/changelog.md entry; a bare name = Jarod's memory file of that name; a sha = commit message; "code" = the current source at that path.

---

## Inbox

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| INB-001 | Mail from Cheng's, Nathan's and the operations@ mailbox appears in one list; one Gmail message held by several mailboxes is one thread. | CL 11 Nov; project_trs_mailbox_privacy_home_todo (11 Nov) | /engagement, email ingest | Ingest one message into two mailboxes; expect one thread. |
| INB-002 | [Standing] A thread held only in a personal mailbox is visible to that mailbox's owner, to operations@, and to any TRS person on its from, to or cc; developer@ is not exempt. | project_trs_mailbox_privacy_home_todo (10 Nov, widened 10 Nov evening) | src/lib/mail/visibility.ts | Sign in as Hasya; a Nathan-only thread returns 403. |
| INB-003 | A thread that operations@ holds, or that no mailbox owns, is visible to everyone at TRS. | project_trs_mailbox_privacy_home_todo | src/lib/mail/visibility.ts | Any staff session opens an operations@ thread. |
| INB-004 | Every route that reads a thread applies the visibility rule (conversations, thread, Today thread, thread bar). | project_trs_mailbox_privacy_home_todo | /api/engagement/*, /api/today/thread, /api/threads/[id]/bar | rule: new thread-reading routes call threadVisibleTo. |
| INB-005 | The Mailbox filter offers All, Operations and one entry per personal mailbox, and only to viewers allowed to see one. | project_trs_mailbox_privacy_home_todo | /engagement | Hasya sees no personal mailbox entries. |
| INB-006 | A thread filed under an insurer or partner is linked to the client it names: subject rules first (name, acronym, domain label), then a model read matched to clients on file by code. | CL 11 Nov evening | src/lib/crm/client-link.ts | "(TRS) Liberty - BLL's Transportation" links to BLL. |
| INB-007 | When the named client has no company on file, the name is kept on the link and the rail offers "Create <name> and link" in one click. | CL 11 Nov evening | ContextRail, thread_insurers | Thread naming an unknown client shows the Create button. |
| INB-008 | Link company on an insurer or partner thread sets the thread's client; it does not re-file the thread away from the insurer. | CL 11 Nov evening | ContextRail | Link a client on an insurer thread; filing stays insurer. |
| INB-009 | Client linking runs nightly in the admin sweep over the last three days of threads. | CL 11 Nov evening | /api/cron/admin-sweep | Sweep run links a new insurer thread. |
| INB-010 | On an insurer-linked thread the rail's Company shows the client and lists the client's threads; with no client known it shows the insurer only, never the insurer's other conversations. | CL 11 Nov | ContextRail.tsx | Insurer thread without client lists no unrelated threads. |
| INB-011 | List rows are two lines by default (sender with triage type and time, then "Company · subject"); Compact is one line; Comfortable adds the state line. | CL 28 Oct (later) | ThreadListPane | Toggle density; row height changes. |
| INB-012 | Thread titles show the cleaned display subject; the raw subject sits in the tooltip. | project_trs_placement (27 Oct, round 3) | Inbox, Overview, pickers | Hover a title; raw subject shown. |
| INB-013 | The reader shows the latest message in full, earlier messages as one-line rows that open in place, and quoted history folded behind one grey row as a nested chain. | CL 30 Sep | ThreadView, MessageBlock | Open a 10-message thread; one expanded. |
| INB-014 | A data table inside an email is kept exactly as sent, with "View original table"; "View original" opens the raw HTML or plain text. | CL 30 Sep | MessageBlock | Email with a table renders it unchanged. |
| INB-015 | Attachments show as cards with Preview and Download; PDFs and images open inline in a new tab. | CL 30 Sep | MessageBlock | Click Preview on a PDF. |
| INB-016 | Cmd+K, Ctrl+K or / focuses search; c opens Compose and r opens the reply when no field is focused. | CL 30 Sep | /engagement | Keyboard journey. |
| INB-017 | The navigator collapses to a 64px icon rail with counts and remembers it per browser; width 320 to 460, default 380. | CL 30 Sep | CollapsedNavRail | Collapse, reload, still collapsed. |
| INB-018 | The reply composer is the last block in the same scroll region as the messages: anchored at the foot at rest, carried away on scroll up, a Draft pill returns to it, height drag-resizes 120 to 900px, phones open it full pane. | CL 30 Sep (anchored reply editor) | ThreadView.tsx | Measure at 1440, 834, 390. |
| INB-019 | Esc closes menus and full screen; it never closes the reply panel, because minimising discards the draft. | CL 30 Sep | Composer | Press Esc with a draft open; draft stays. |
| INB-020 | The composer has To chips, Cc/Bcc, From and Signature selects, a grouped toolbar with tables, and Approve & Send as the one primary. | CL 30 Sep | EngagementComposePanel | Compose journey. |
| INB-021 | Must not: show Forward, Send later, Preview, Template or any control that has no handler. | CL 30 Sep (judgement calls) | Inbox | rule |
| INB-022 | Must not: auto-refresh, a realtime subscription that blinks the thread, or a per-tab ingest poll on the Inbox (90-second poll removed 9 Nov). | CL 6 Jul; project_trs_next_actions_bar (9 Nov) | /engagement | No /api/email/ingest-trigger call from an open tab. |
| INB-023 | The thread summary and reply drafts run only on a button; nothing generates when a thread opens. | CL 6 Jul | ThreadView, ChiefBar | Open a thread; no model call logged. |
| INB-024 | The context rail is open by default from 1024px and widens to 480px while a draft is open; below 1024px it is a sheet. Replaces 30 Sep (closed by default). | project_trs_next_actions_bar (6 Nov) | ContextRail | Open at 1440 and 834. |
| INB-025 | [Standing] The rail has three groups in this order: Actions, AI, Information, each under a green pill title. | project_trs_rail_format (10 Nov); design-system.md | ChiefBar.tsx, ContextRail.tsx | Snapshot of group titles. |
| INB-026 | Actions shows who the thread waits on with the chaser timer, drafts opened in place, Send chaser, Snooze 3 days, No action and Open case. | project_trs_next_actions_bar | ChiefBar.tsx | Waiting thread shows timer and Snooze. |
| INB-027 | Waiting status ignores auto-replies and internal forwards. | project_trs_next_actions_bar | src/lib/threads/waiting.ts | Auto-reply does not flip who is owed. |
| INB-028 | [Open] After TRS delivers what was owed, the bar still says "Waiting on <client>" and offers a chaser; a fix must keep INB-026. | CLAUDE.md section 5; project_trs_mailbox_privacy_home_todo (11 Nov) | src/lib/threads/waiting.ts | Empyrion claim thread offers no chaser. |
| INB-029 | The AI group holds exactly Read thread, Summary and Draft reply. | project_trs_mailbox_privacy_home_todo (11 Nov late) | ChiefBar.tsx | Count AI rows = 3. |
| INB-030 | Read thread reads messages, parsed files, the linked case and the insurers on file, returns a summary and steps ticked by default; "Draft N emails · N actions to do" writes one pending draft per email step. | project_trs_mailbox_privacy_home_todo (10 Nov night) | src/lib/chief/read.ts | Read then draft; drafts pending, none sent. |
| INB-031 | An insurer step with no contact on file becomes an action "add one on the Insurers page". | project_trs_mailbox_privacy_home_todo | src/lib/chief/read.ts | Thread for an insurer with no contact. |
| INB-032 | Information shows label-value rows for company, policy, renewal, outstanding, contact and threads; Status and notes fold under a details element. | CLAUDE.md; design-system.md (Rail format) | ContextRail.tsx | Rows present on a linked thread. |
| INB-033 | Prepare insurer emails, when the client already has an open placement, links to that placement and its thread instead of failing with 409. | CL 11 Nov | ChiefBar, /api/placements | Second Prepare on the same client returns 200. |
| INB-034 | A new enquiry in the bar lists one person per insurer per policy and offers "Send N separately". | project_trs_next_actions_bar | ChiefBar.tsx | Enquiry thread shows per-insurer list. |
| INB-035 | "Since you were away" is one 36px strip with Show/Hide, the triage link and dismiss, with no rule line under it. | CL 28 Oct (later); CL 11 Nov evening | layout | Strip height 36px. |
| INB-036 | The Unassigned work view lists threads filed under a company with no owner; Unlinked stays a separate view. | CL 30 Sep (later) | ThreadListPane | Company without owner shows its threads. |

## Today, Home, Follow-ups, Calendar

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| TOD-001 | Today lists work in five groups: Ready to send, Decide, To act, Read, Come back later. | code; project_trs_client_structure (2 Nov) | /today | Groups render in order. |
| TOD-002 | The Owner filter offers Mine and Everyone; Mine includes items with no owner. | code | /today | Unowned item appears under Mine. |
| TOD-003 | j and k move through the list, Enter opens; Start opens the first item. | code | /today | Keyboard journey. |
| TOD-004 | Nothing sends from the Today list; Review and send opens the case page. | code | /today | No send button on the list. |
| TOD-005 | The case page right column is Actions, Information (with an Owner row), Source and Timeline under green pills, with no boxes. | project_trs_rail_format (11 Nov); design-system.md | /today/[id] | Snapshot of column groups. |
| TOD-006 | [Standing] The owner reads "Owner: <name>" (or "No owner") with a Reassign menu; never a chip and never a select. | project_trs_rail_format | /today/[id], work cards | rule |
| TOD-007 | Sending from a case runs edit draft, prepare send, /api/email/send, follow-up, sent, carrying the edited To and Cc. | feedback_trs_send_route_locked | src/lib/today/data.ts | Edit Cc, send to a .invalid test address on Jarod's go. |
| TOD-008 | Paired drafts (client and insurer) are reviewed together on the case page, with forward to insurer. | project_trs_client_structure (2 Nov) | /today/[id] | Paired case shows both drafts. |
| TOD-009 | Coming up (/today?view=coming) opens on Employment Benefits renewals, then renewals, debit notes due, money past due and case steps grouped Overdue, Today, Next 15, 16 to 30, 31 to 45, 46 to 90 days. | project_trs_rail_format (11 Nov); CL 12 Nov | ComingUp.tsx, EbRenewals.tsx | Groups render with items. |
| TOD-010 | Overdue in Coming up stops at 30 days; older overdue renewals are a count linking to Companies?renewal=overdue. | 2278cd08, 54e46f90 | ComingUp.tsx | Link lands on the filtered list. |
| TOD-011 | Employment Benefits renewals list every employee-benefits policy ending in the next 120 days; each row opens the census picker; nothing prices unattended. Replaces 12 Nov 00:20 (Analyse ran the client's last census). | f4b1bb14; CL 12 Nov | EbRenewals.tsx, /api/today/eb-renewals | Row button opens the picker, no run logged. |
| TOD-012 | The renewals table folds policy number and insurer into one column so it fits the Today column. | e81fa1d9 | EbRenewals.tsx | No horizontal scroll at 1440. |
| TOD-013 | A to-do digest goes per owner from operations@ at 08:30 SGT (all items) and 14:00 SGT (only what moved since 08:30), skipping SG public holidays; ?dry=1 previews. | project_trs_mailbox_privacy_home_todo | src/lib/today/digest.ts | Dry run returns per-owner bodies. |
| TOD-014 | The digest lists only items moved in 14 days, due within 14 days or lapsed; the rest is one count line; unowned items are counted, not listed. | project_trs_mailbox_privacy_home_todo (10 Nov night) | src/lib/today/digest.ts | Dry run for Nathan under 50 lines. |
| TOD-015 | [Open] Jarod asked for a Coming up section in the 08:30 digest as a notification; not built. | project_trs_rail_format | src/lib/today/digest.ts | Digest dry run has a Coming up block. |
| TOD-016 | Home (/) shows a To do list above the canvas: Suggested first, then Send, To act, Decide, Read, ordered lapsed, then nearest deadline, then longest wait. | project_trs_mailbox_privacy_home_todo (10 Nov) | TodoList.tsx, src/lib/today/todo.ts | Order check on seeded items. |
| TOD-017 | A Home to-do's Send panel edits To, Cc, Subject and body and sends by the same path as the case page; paired drafts route to /today/[id]. | project_trs_mailbox_privacy_home_todo | TodoList.tsx | Send journey on a test item. |
| TOD-018 | Ask AI on a to-do rewrites the draft to an instruction, or writes the first draft when none exists. | project_trs_mailbox_privacy_home_todo | /api/work/[id]/ask | Ask with instruction; draft changes. |
| TOD-019 | Nexus on a to-do opens a new case prefilled with the company. | project_trs_mailbox_privacy_home_todo | TodoList.tsx | Link carries companyId. |
| TOD-020 | Follow-ups (/followups) holds chases set on Today before send; pre-approved chases go out through the auto-sender. | project_trs_case_spine (4 Nov) | /followups, email_followups | Set chase, see it listed. |
| TOD-021 | Board (/board) keeps the pinned companies in five columns: Quoting, Quoted, Presented, Bound, In force. | project_trs_placement (27 Oct late); project_trs_client_structure (2 Nov, moved to /board) | /board | Pin a company; card appears. |
| TOD-022 | Calendar shows every dated item: renewals, debit notes due, money past due pinned to today (amount still outstanding, linking to Finance), case deadlines, and active policies past their end pinned to today. | CL 11 Sep (late); CL 28 Sep (later) | /calendar | September shows all five kinds. |
| TOD-023 | Calendar uses the shared renewal bands, has window chips, accepts ?date=YYYY-MM-DD and gives each renewal an Open company link. | CL 28 Sep (later) | /calendar, src/lib/crm/renewal.ts | Deep link opens the month. |

## Clients: Companies, People, Unfiled threads, Nexus

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| CLI-001 | Every company is a full page; every company link lands on /companies/[id]; there is no company drawer. Replaces 28 Sep and 29 Sep (drawer). | CL 27 Oct (later) | /companies/[id] | Click a company row; URL changes. |
| CLI-002 | The company page opens on Quotes; the main tabs are Quotes, Employment Benefits, Policies, Data room; More holds Overview, Knowledge, Renewals, Employees, Finance, Threads, Log, Nexus. Replaces 27 Oct tab list. | code | src/app/companies/[id]/page.tsx | Default tab = Quotes. |
| CLI-003 | Old tab links still land: quotation to Quotes, activity to Log, people to Overview, purchases to Policies, employees to Employees, payments to Finance. | code (TAB_ALIAS) | src/app/companies/[id]/page.tsx | ?tab=quotation opens Quotes. |
| CLI-004 | Company tabs are one segmented row with plain counts, never an urgency figure, wrapping on a phone. | code | src/app/companies/[id]/page.tsx | 390px shows wrapped tabs, no scroll. |
| CLI-005 | The company header shows the name on one line and at most three actions; Drafts to approve is the primary; Ask AI is not in the header. | project_trs_placement (27 Oct review, round 3) | CompanyHeader | Count header buttons <= 3. |
| CLI-006 | Drafts to approve covers the whole company and is reachable from the header on every tab. | CL 27 Oct (later) | /api/companies/[id]/drafts | Open on Finance tab. |
| CLI-007 | A company has one or many owners chosen in OwnerPicker; nothing defaults an owner; an empty list reads "No owner". | CL 30 Sep (night, later) | OwnerPicker | Add two owners; both listed. |
| CLI-008 | An unconfirmed company shows a Confirm control in its header and a dot on the Companies list. | CL 22 Sep | CompanyHeader, CompanyTable | Confirm clears the dot. |
| CLI-009 | The Threads tab is the Inbox scoped to the company, full screen, with the same message cards and composer; message counts come from real rows. | CL 11 Sep (night); CL 11 Sep (evening) | CompanyMail.tsx | Thread with 14 messages says 14. |
| CLI-010 | The Employees tab (renamed from Members) says "N on the list, from the client's email" when the list arrived by email. | project_trs_placement (27 Oct); project_trs_rail_format | MembersPanel | Empyrion shows 28 from email. |
| CLI-011 | The Employment Benefits tab is the register filtered to the company, with its policies and + New Employment Benefits prefilled with the company. | CL 12 Nov; e81fa1d9 | CompanyEb.tsx | New from the tab carries companyId. |
| CLI-012 | The Knowledge tab shows the company's open next steps at the top. | project_trs_nathan_method (3 Nov) | CompanyKnowledge.tsx | Open work item listed first. |
| CLI-013 | The Renewals tab shows the renewal calendar and the company's renewals. | code; project_trs_client_structure (3 Nov) | RenewalCalendar, CompanyRenewals | Tab renders both. |
| CLI-014 | Overview's Open items, Where we left off and Log are one line per row: date in the When column, relative time in the tooltip, rows open what they name. | CL 28 Oct; CL 30 Sep (later) | Overview | Row click navigates. |
| CLI-015 | The Log shows the company memory (opened, sent, reply, quote, declined, ask, change, chase, decision, note); staff add notes and decisions. | CL 27 Oct; docs/placement.md | Log tab | Add note; appears at top. |
| CLI-016 | The Nexus summary refreshes only on a button; it never spends tokens on its own. | CL 11 Sep | Nexus tab | Open page; no model call. |
| CLI-017 | The Companies register is one line per row: Company (frozen), Stage, Threads with "n awaiting", LTV, next renewal, Owner, last activity; every header sorts; default sort renewal. | CL 29 Sep; CL 28 Oct | CompanyTable.tsx | Sort by each header. |
| CLI-018 | Companies has a Clients/Insurers switch; insurers are companies of kind insurer with the same owner, pin and to-do model. | CL 29 Sep | /companies | Switch to Insurers. |
| CLI-019 | Companies opens on the renewal window named in the URL (?renewal=overdue). | 54e46f90 | /companies | Deep link filters. |
| CLI-020 | The Unassigned quick view lists companies with no owner. | CL 30 Sep (later) | /companies | Ownerless company shown. |
| CLI-021 | Company search filters as you type on name and domain, shows the domain under each name, and works from the keyboard. | CL 1 Oct (later) | CompanySearchSelect | Type "kel"; Keller shown with domain. |
| CLI-022 | Every company field is the shared search box with "+ Add as a new company"; never free text and never a separate new-company form. | feedback_mockups_from_existing_code (12 Nov); docs/gb-pricing-method.md (10 Nov) | CompanyField.tsx | rule |
| CLI-023 | A new company opens at stage Client; Lead and Prospect are never suggested; suggestions are Quoting, Renewal due (60 days) or Lapsed (550 days dormant; any billing or active policy proves a client). | CL 11 Sep; CL 11 Sep (company workspace) | src/lib/crm/stage.ts | Unit: payer on time never lapsed. |
| CLI-024 | Automatic filing no longer creates client companies; the one exception is the insured named in a benefits request (EB-041). Replaces 22 Sep (create regardless of confidence). | project_trs_client_structure (1 Nov); CL 11 Nov evening | src/lib/admin/a, autofile | New unknown domain lands in the queue. |
| CLI-025 | Unfiled threads (/companies/triage) has Domains, Leftover threads, Duplicates and Under an insurer; every count loads on arrival. | CL 11 Sep (evening); CL 1 Oct | /companies/triage | Counts present before tab click. |
| CLI-026 | Under an insurer groups threads by the client read from the subject; one decision moves all: to an existing company, create and move, or insurer-only (remembered). | CL 1 Oct | src/lib/crm/misfiled.ts | Forsea group clears 7 threads. |
| CLI-027 | A domain card shows the agent's evidence line and an alternative reading. | CL 1 Oct (later) | /companies/triage | Card shows both lines. |
| CLI-028 | Merging companies moves threads, contacts, debit notes, quotes and members in one transaction and keeps the old spelling as an alias; nothing cascades away. | project_trs_client_structure (31 Oct); CL 11 Sep (evening) | merge_companies RPC | Merge test pair; EB members survive. |
| CLI-029 | People shows each person's title read from their signature and marks anyone only ever copied. | CL 22 Sep | People | Copied-only marker shown. |
| CLI-030 | Point persons are derived from correspondence, never assigned by hand. | CL 10 Sep | src/lib/crm/people.ts | rule |
| CLI-031 | Customer value states premium billed, TRS commission and effective rate, policy count, client since and last billed, with the currency stated. | CL 11 Sep (evening) | Policies tab | Figures match debit notes. |
| CLI-032 | Ask Opus is the client's consultant: a case resolves to its company, so one conversation covers claim, renewal and money. | CL 11 Sep (night) | chat dock | Open case; scope = company. |

## Quotes › Employment Benefits

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| EB-001 | The Quotes place lands on /pricing-matrix and its first tab is Employment Benefits. Replaces 11 Nov ("Benefits calculator", third tab). | CL 12 Nov; c14bc020 | nav-sections.tsx | Click Quotes; EB register shown. |
| EB-002 | [Standing] Every tab, breadcrumb, rail item, register, report and email says Employment Benefits, never EB. Replaces 12 Nov changelog wording. | feedback_spell_product_names (12 Nov); c14bc020 | all UI strings | rule: grep UI for "\bEB\b". |
| EB-003 | The register lists every saved quotation, one row each: company, lives, start, basis, best price net and its insurer, categories, source, last change; filters All, Starting within 90 days, Renewals, New business. | CL 12 Nov | EbRegister.tsx | Filters change counts. |
| EB-004 | The register premium is the analysis summary premium when an analysis exists, else the lowest complete total; an incomplete lowest is marked *. | e81fa1d9; CL 12 Nov | EbRegister.tsx | OUE shows the analysis figure. |
| EB-005 | + New Employment Benefits takes a census file plus company, start date, basis, current insurer and the insurers the client ruled out. | CL 12 Nov | NewEb.tsx | Form journey. |
| EB-006 | The census is read from the original file (uploaded, or fetched again from Gmail with other copies as fallback); every sheet is listed with its headcount and the broker ticks the tabs. | f4b1bb14 | /api/group-benefits/census/read | 13-tab OUE file reads 602 lives. |
| EB-007 | A password-protected workbook opens with a password prefilled from the email ("PW: ..."); protected files are marked. | f4b1bb14 | census/read, xlsx-text.ts | Empyrion protected file opens. |
| EB-008 | Ingest keeps up to 400,000 characters of attachment text. Replaces 30,000. | f4b1bb14 | attachments extract | Large census not truncated. |
| EB-009 | Dates of birth are read day-first or ISO, never month-first. | project_trs_dashboard_crm (2 Oct) | src/lib/dates/dob.ts | Unit: 24/12/1971 = 24 Dec. |
| EB-010 | A numbered sheet with no name column is read: S/N numbers the people, a D suffix marks a dependant, Job Level is the category; a nationality is never a name. | CL 12 Nov | chief/census.ts, gb/census-parse.ts | gb-census-numbered.test.ts |
| EB-011 | The census plan columns (GHS, GMM, GP, SP, Dental, GTL) and monthly salary are read per person and set the current programme. | f4b1bb14; 039c7216 | src/lib/gb/current.ts | "Maintain current coverage" prices the sheet's plan. |
| EB-012 | The broker states once, as numbers, what each plan number means; the schedule is kept on the quotation and prefilled next time. | f4b1bb14 | NewEb.tsx | Second run is prefilled. |
| EB-013 | A run prices the current cover, then one change at a time (beds, hospital type, limit, annual limit, co-insurance, major medical, life cover) at every insurer; a change that moves no price is left out. Replaces 12 Nov package ladder and fifteen prices. | f4b1bb14 | src/lib/gb/analysis.ts | OUE run lists only moving changes. |
| EB-014 | The report opens on the current cover schedule and its price at every insurer, then the change table with the difference per insurer. | f4b1bb14 | /pricing-matrix/quote/[id]/analysis | First section = current cover. |
| EB-015 | [Standing] Requirements are numbers (per-disability or annual S$, co-insurance %, major medical S$, GP co-pay S$, specialist and dental limits S$, sums or salary multiples, dependants, categories); never Entry/Top or low/mid/high. | project_trs_eb_source_docs (11 to 12 Nov) | plan builder, analysis | rule: grep UI for "Entry", "Top". |
| EB-016 | The current insurer is priced on its renewal card; every other insurer as new business. | CL 12 Nov; 039c7216 | analysis.ts, scenario-run.ts | Empyrion QBE on renewal card. |
| EB-017 | Each insurer is priced on the one card in force on the effective date for the basis; other cards fold under "cards not in force on this date". | docs/gb-pricing-method.md (10 Nov); 039c7216 | priceBuilder, cardsInForce | QBE never summed twice. |
| EB-018 | An insurer the client ruled out is priced and shown greyed but readable and clickable; never dropped. | CL 12 Nov; project_trs_eb_source_docs | analysis report | Ruled-out row present, grey. |
| EB-019 | An insurer whose package the headcount exceeds is left out with a note, not priced on a card that does not apply. | docs/agent-routing.md | gb engine | 120-life census skips QBE package. |
| EB-020 | Members a switch leaves unpriced (renewal-only age bands) are named with the reason in client words. | docs/gb-pricing-method.md (11 Nov) | client-draft.ts, report | 73-year-old named. |
| EB-021 | Tier A (Income, AIA, RCC, QBE, Singlife) is priced for every request; Tier B (Cigna 1.0 priced; Cigna 2.0 and April on request) and Tier C only when the broker selects them. | docs/gb-pricing-method.md (30 Oct); project_trs_group_benefits_v2 | builder, outreach.ts | Default run has 5 insurers. |
| EB-022 | Gembridge reproduces to the cent: RCC 37,799.61, Income 28,549.90, QBE 46,224.85, Singlife 27,702.00. | docs/gb-pricing-method.md | gb engine | gb-gembridge-reproduction.test.ts |
| EB-023 | Pricing rules hold: age last birthday except RCC next birthday; Income and AIA rates netted of GST by 1.09; life and CI GST-exempt; RCC group factor on medical lines by employee count; renewal-only bands price nothing on new business. | docs/gb-pricing-method.md | src/lib/gb-quote.ts | Unit tests. |
| EB-024 | An analysis reads the rate tables once (20-second memo); 602 lives price in about 2.5 s. | c14bc020; f4b1bb14 | analysis.ts | Timing check under 5 s. |
| EB-025 | The thread rail offers one item, "Employment benefits analysis", on every thread of the client's benefits conversation and on any thread carrying a census; Open census opens the picker; nothing runs unattended. Replaces 11 Nov ("EB pricing estimate") and 12 Nov ("EB analysis", Analyse). | code (suggest.ts, ChiefBar.tsx); f4b1bb14 | ChiefBar.tsx, src/lib/chief/suggest.ts | Benefits thread shows one item; click opens picker. |
| EB-026 | A census forwarded several times is one item; there is no separate "Census received" item. | CL 11 Nov evening | src/lib/chief/suggest.ts | Thread with 4 forwards shows one item. |
| EB-027 | A benefits conversation is this thread plus the company's group_benefits or benefits-subject threads of 90 days (max 6), claims and quote-request categories excluded; a client with an active benefits policy counts. | project_trs_mailbox_privacy_home_todo (11 Nov) | scenario-run.ts benefitsThreads | Empyrion claim thread gets the item. |
| EB-028 | A done item stays in Actions with Draft to client (until a client draft exists), Open and New analysis. | code (ChiefBar.tsx) | ChiefBar.tsx | Done item shows three buttons. |
| EB-029 | Draft to client is written by code: "Dear <first name>", the basis, the premium summary incl. 9% GST per option, a starred note on unpriced members, how the figures were derived, Our suggestion, next step, "Warmest Regards, {owner_name}". | docs/gb-pricing-method.md (11 Nov) | src/lib/gb/client-draft.ts | Draft contains every section. |
| EB-030 | [Standing] A model rewrite of client email prose is kept only when every figure the code wrote survives. | CLAUDE.md; docs/gb-pricing-method.md | keepsFigures | Unit: altered figure discards rewrite. |
| EB-031 | To is the last outside person who wrote on the thread; Cc is the other outside writers; the draft waits in the thread bar and nothing sends. | docs/gb-pricing-method.md (11 Nov) | client-draft.ts | Empyrion: To Janice, Cc Pearlin. |
| EB-032 | Suggestion rules: within a stated budget name the insurers under it; recommend a switch only when a complete alternative is at least 10% cheaper; renew where only the current insurer is complete and name the cheapest alternative with the members it does not take. | docs/gb-pricing-method.md (11 Nov) | suggestionLines | Unit cases. |
| EB-033 | The client report PDF is attached with its pricing page; dependants read "None on the list" when there are none; an unreadable PDF is marked, not retried. | fa893173 | report-pdf.tsx | Render with no dependants. |
| EB-034 | The client report and Draft to client read the latest analysis through analysisAsScenarios; the older scenario pack is read only where no analysis exists. | CL 12 Nov | analysisAsScenarios | Draft from an analysis-only quote. |
| EB-035 | Split by category prices management and staff on different choices as one programme. Check it survives f4b1bb14 (packages removed). | CL 12 Nov | runSplit | Two-category census priced once. |
| EB-036 | Custom prices the broker's own numbers by resolving each to the plan at every insurer that meets it; critical illness and accident sit behind More. | CL 12 Nov | src/lib/gb/custom.ts, limit-facts.ts | Custom column present. |
| EB-037 | Every insurer name carries a tooltip of its plan facts; premiums carry the price-derivation tooltip. | project_trs_eb_source_docs (12 Nov); project_trs_mailbox_privacy_home_todo (11 Nov) | insurer-names.ts | Hover shows facts. |
| EB-038 | Back follows stage order: the report goes back to the source its run started from (thread, register, company page), stored on the analysis; quotation, builder and client report go back to the report. | CL 12 Nov; 621ab3fc | Breadcrumbs fallback | Paste report link; Back lands on source. |
| EB-039 | The plan builder (/pricing-matrix/quote/<id>/plans) changes one plan per cell per insurer; Save prices on the card in force. | CLAUDE.md section 5 | builder.ts | Override one cell, save. |
| EB-040 | A client email with a census classified group_benefits is read once by a model, the census by code, a draft quotation opens, and a repeat request supersedes rather than duplicates. | CLAUDE.md section 5; project_trs_group_benefits_v2 (30 Oct) | src/lib/gb/intake.ts | Same email twice = one live quotation. |
| EB-041 | The insured named in a benefits request that arrives through a partner or insurer goes on file as a client and the thread links to it. | CL 11 Nov evening | ensureClientForRequest | OUE via Mednefits links OUE. |
| EB-042 | Engine prices from an emailed census land on the company's one open Employment Benefits line without re-upload. | project_trs_rail_format (11 Nov); 8f1df007 | src/lib/placement/auto-attach.ts | Line shows priced quotes. |
| EB-043 | The Employment Benefits page has one header action (Email insurer), section tabs as the segmented control, and "Quote from a file" in place of "By hand". | 273f8c0e | /pricing-matrix | Header has one button. |
| EB-044 | Email insurer drafts a request to on-request insurers (Cigna, April, others) and opens it in the composer; a contact can be added inline. | project_trs_group_benefits_v2 (23 Oct) | Email insurer dialog | Dialog journey to draft. |
| EB-045 | Enter insurer rates (large groups) shows the census by plan and family tier, takes rates by method, totals with GST as you type, checks the insurer's stated total and files a quote with source custom_rates. | docs/agent-routing.md | CustomRatesDialog.tsx | Mismatch is flagged. |
| EB-046 | An insurer's stated premium that does not match its own basis holds the quote for a person. | docs/agent-routing.md | src/lib/gb/custom-quote.ts | Genscript slip held. |
| EB-047 | HR link: the client's HR uploads a file or connects Talenox, Workday, SimplePay, HiBob, Deel or BambooHR on /connect/<token>; TRS never sees credentials; the list lands on its quotation or policy. | project_trs_group_benefits_v2 (19 to 29 Oct) | /connect/[token], lib/hr | Upload journey with .invalid data. |
| EB-048 | [Standing] Every company with a benefits quote or HR link gets "<company>/Employment Benefits" in the debit-note Drive root, created automatically. | project_trs_group_benefits_v2 (23 Oct) | Drive helpers | Folder exists after quote. |
| EB-049 | Must not: packages (Essential, Standard, Enhanced, Executive, Premier) in the flow. | f4b1bb14 (Ernest: "packages mean nothing to a client") | analysis, NewEb | rule |
| EB-050 | Must not: the retired A/B/C estimate section, the Policies, Coverage and Activity tabs under Employment Benefits, the dead "+ Quotes" button or the Drive button. | CL 12 Nov; 273f8c0e | /pricing-matrix | rule |

## Requests for quotes and Placement

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| RFQ-001 | [Standing] Placement is agent-first: a quote request (rfq at 0.7 or above) opens a placement with its lines, one contact per insurer and drafts marked "Proposed by the agent" with Dismiss; the manual dialog is the fallback. | project_trs_placement (27 Oct review) | /api/placements/auto | Seed a request thread; placement proposed. |
| RFQ-002 | One draft per policy line, fanned out at send into one Gmail message per recipient ("Send to N insurers"). Replaces 27 Oct (one email per underwriter covering all lines). | project_trs_placement (27 Oct review) | /api/placements/drafts/[id]/fanout | Send fans out to N messages. |
| RFQ-003 | [Standing] One address in To, always; colleagues move to Cc, other companies are removed; insurer requests copy only TRS; insurers never see each other. | project_trs_next_actions_bar (6 Nov); docs/placement.md | src/lib/email/recipients.ts | Unit on recipient lists. |
| RFQ-004 | The agent never sends; every draft waits as pending and a broker sends it from the dashboard. | CL 27 Oct; docs/placement.md | ai_drafts | No send without a session. |
| RFQ-005 | A quote keeps premium, limit, excess and validity verbatim with a source excerpt per field and a normalised amount; a figure with no excerpt is marked for checking. | CL 27 Oct | placement_quotes | Reply without excerpt flagged. |
| RFQ-006 | A change of ask on the client thread is logged with the proposed spec and the line shows "Client change to confirm"; the broker opens the round. | docs/placement.md | workflow.ts | Client reply with new limit. |
| RFQ-007 | A new round shows the diff, writes a change summary, withdraws unanswered dispatches of the previous round and asks every insurer again with what changed. | CL 27 Oct; docs/placement.md | workflow.ts | Open round 2; drafts carry the change. |
| RFQ-008 | Email client drafts the comparison: one table per line, declines and still-waiting insurers named; the placement moves to presented. | docs/placement.md | workflow.ts | Draft lists declines. |
| RFQ-009 | Choose on a quote binds the policy: sibling quotes not chosen, open dispatches withdrawn, the log records the decision. | CL 27 Oct (later) | src/lib/policies/spine.ts | Choose; siblings marked. |
| RFQ-010 | The agent reads the last 40 log entries before writing anything for the company. | docs/placement.md | placement agent | rule |
| RFQ-011 | A line with no insurer contact on file is logged and skipped, not sent to a guess. | docs/placement.md | rank.ts | Line with no contact logs a skip. |
| RFQ-012 | Missing request data holds the line and sends one data-request email to the client with numbered questions; held lines release on the client's reply. | project_trs_case_spine (3 Nov); docs/agent-routing.md | new-request agents | Held line released after reply. |
| RFQ-013 | The line's desk adds client questions, broker notes and suggested extra lines (WICA, liability, Employment Benefits, CAR, financial, property, motor); backdated cover asks the nil-claims letter once. | docs/agent-routing.md | src/lib/agents/new-request/* | Dry run on open placements. |
| RFQ-014 | Panel order follows the line: EQ first for small CAR, GE first from S$50m; 3, 4 or 6 markets; insurer deadline 5 working days, or 2 before inception. | project_trs_nathan_method (2 Nov) | src/lib/placement/lines.ts | Unit on pickPanel. |
| RFQ-015 | A single-line request with no named insurer uses Nathan's fixed submission block, written by code. | project_trs_nathan_method | placement/agent.ts fixedSubmission | Draft equals template. |
| RFQ-016 | The comparison heads follow the line family (construction: Lead/share, Rate, Premium, Sum insured, Deductible, Subjectivities, Valid until); declines carry the insurer's reason. | project_trs_nathan_method | compare.ts | Construction comparison columns. |
| RFQ-017 | A decline citing another broker marks the line blocked; the appointment letter shows needed, sent or signed. | project_trs_placement (29 Oct) | placement UI | Decline sets blocked. |
| RFQ-018 | Binding waits for the documents the case needs (client instruction, proposal form, quote slip, nil-claims letter if backdated, appointment if another broker is on risk, bond set); missing ones are asked; Waive needs a note. | project_trs_nathan_method (2 Nov) | src/lib/admin/b/documents/gate.ts | document-gate.test.ts |
| RFQ-019 | A placement picked up mid-way reads the whole client thread, matches earlier insurer threads, and records them without drafting. | project_trs_placement (30 Oct) | src/lib/placement/adopt.ts | Dry run on a midway thread. |
| RFQ-020 | The Quotes tab shows one grid per placement, a group row per line, premiums as S$ figures, no Round column. | project_trs_placement (27 Oct, round 3) | CompanyQuotes.tsx | Grid layout snapshot. |
| RFQ-021 | Quotes carry rate, base, share, role and brokerage with a rate times base check. | project_trs_placement (30 Oct) | placement_quotes | Mismatch flagged. |
| RFQ-022 | The contact picker defaults to one contact per insurer, with per-line picks. | project_trs_placement (27 Oct) | ContactPicker | Default ticks one per insurer. |
| RFQ-023 | Requests for quotes (/rfq) is the register of placements across companies. | project_trs_placement (29 Oct) | /rfq | Lists placements of two companies. |
| RFQ-024 | The appointment letter generator writes PDF and Word, files to Drive <Company>/Letters, and can draft the client email. | project_trs_placement (29 Oct) | /api/letters/appointment | Generate for a test company. |
| RFQ-025 | The nil-claims letter of undertaking is attached to the document request when missing; an insurer with no address prints "[Address]". | project_trs_nathan_method (3 Nov) | src/lib/letters/undertaking.ts | Generate with no address. |
| RFQ-026 | Insurers lists declines (Insurers, Declines) and default contacts per product; Nathan fixes defaults there before go-live. | project_trs_case_spine (4 Nov); project_trs_insurer_contacts | /insurers | Declines tab renders. |

## Policies and member movements

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| POL-001 | The policy row is the record, with lifecycle quoting, presented, bound, live, renewal due, lapsed, declined, closed. | CL 27 Oct (later) | policies, src/lib/policies/spine.ts | Lifecycle unit tests. |
| POL-002 | The first debit note for a bound policy makes it live and fills number and period; it never creates a second row. | CL 27 Oct (later) | debit-note-commit.ts | Approve DN; one row. |
| POL-003 | [Standing] An endorsement is an amendment to the main policy: its debit note attaches to the master and keeps the master's term and renewal date; never a second active policy. | CL 30 Sep (later); project_trs_dashboard_crm (Jarod's rule) | src/lib/policies/endorsement.ts | Import "/E01" note; master unchanged. |
| POL-004 | The master is found by base number, else the one master with the same term end and class; it never guesses between two. | CL 30 Sep (later) | findMasterPolicy | Unit with two candidates returns none. |
| POL-005 | Counts and the calendar renew each cover once; purchase history labels "Amendment to <number>" with renewal "Follows the main policy". | CL 30 Sep (later) | aggregates.ts, calendar | Endorsement not counted twice. |
| POL-006 | A live policy past its end date rolls to expired every hour. | 2db734b0 | admin-sweep expirePolicies | Seed past-end policy; expired after sweep. |
| POL-007 | A client email listing joiners and leavers becomes movements plus a drafted endorsement request to the chosen insurer; the insurer's debit or credit note matches the movement; proration is the insurer's. | CL 27 Oct (later) | src/lib/policies/* | dogfood-movements.mts |
| POL-008 | A heads-up or undated movement is held by the date gate. | docs/agent-routing.md | date-gate.ts | Undated leaver held. |
| POL-009 | One email touching several policies runs once per policy; a list marked with a line applies only to that line. | docs/agent-routing.md | endorsement main agent | "FWMI & EB" email splits. |
| POL-010 | A staff forward of a client's email is read as the client's email. | docs/agent-routing.md | endorsement main agent | Forwarded movement processed. |
| POL-011 | Movements prorate days over 365 at both ends, check variance at 2%, and move reported, sent, noted, billed, settled. | project_trs_group_benefits_v2 (30 Oct) | movements | GE DN 191.21 reproduced. |
| POL-012 | The weekly position (pax, joins, leaves, billed, credited, net) is computed every Monday 01:30 SGT. | CL 27 Oct (later); docs/placement.md | /api/cron/policy-position | Cron run writes a row. |
| POL-013 | An issued policy is checked against the chosen quote (premium within 1.5% or plus GST, period, insurer, sum insured, number); a difference goes to a person. | project_trs_nathan_method (Phase 4) | src/lib/policies/issued-check.ts | Unit cases. |
| POL-014 | [Standing] Renewal marks are 90, 45, 30 and 15 days; the price check holds under 40% loss ratio, increases over 60%, adjusts on headcount change over 10%, and says no data when claims are blank. | project_trs_case_spine (Jarod said 90/45/30/15) | src/lib/cases/renewal.ts | Unit cases. |
| POL-015 | At 90 days the line's desk writes the client data request; CAR and bonds get an extension check from 45 days instead of a renewal. | docs/agent-routing.md | src/lib/agents/renewal/review.ts | Dry run counts. |
| POL-016 | The renewal method is editable in Settings, Agents, Renewal method; the default text carries no client names. | project_trs_case_spine | src/lib/methods/method.ts | rule |
| POL-017 | Employment Benefits renewals ask the insurer for the claims report at 60 days; no renewal notice by 30 days goes to a person. | project_trs_nathan_method | sweeps.ts | Sweep on seeded policy. |
| POL-018 | The policy page has Ledger and Renewal tabs and Draft renewal advice. | project_trs_client_structure (3 Nov) | /policies/[id] | Tabs render. |
| POL-019 | Member movements (/movements) lists movements with Raise TRS note. | project_trs_group_benefits_v2 (30 Oct); nav | /movements | Raise note creates a bundle. |

## Claims

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| CLM-001 | The claims register covers every class; claims backfilled from mail (WICA, EB, PI) and agent claims (wica, eb, pi) are both read. | docs/agent-routing.md; project_trs_claims_backfill | /claims | Both casings listed. |
| CLM-002 | A new claim gets its class's first actions: WICA MOM iReport in 10 days; motor report in 24 hours and no repair before survey; property police report and keep items; liability admit nothing; marine notice to carrier; trade credit invoices and limit; financial notify in period. | docs/agent-routing.md | src/lib/agents/claims/review.ts | Unit per class. |
| CLM-003 | A deadline that can still be met and falls within two days goes to a person; a past deadline on an old claim does not. | docs/agent-routing.md | claims review | Unit. |
| CLM-004 | Insurer claims experience outranks the register in the renewal price check. | project_trs_claims_backfill | claims_experience | Unit. |
| CLM-005 | A claim letter from an insurer opens or updates the claim; the agent drafts adjuster access and settlement pack at those stages. | project_trs_client_structure (3 Nov); project_trs_nathan_method | src/lib/documents/money-store.ts | Seed letter; claim opened. |
| CLM-006 | Claim draft rows use outlined secondaries with one green primary. | project_trs_rail_format (11 Nov) | /claims | rule |

## Finance

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| FIN-001 | Receipts lists every note with money against it, oldest first, client attached; a payment records amount, date, channel (paid TRS, settled direct with insurer, written off) and reference; part payments carry. | CL 11 Sep (later) | /finance, RecordPaymentDialog | Part payment leaves balance. |
| FIN-002 | Payments are a receipts ledger; a trigger derives the debit note's amounts and status; undoing a payment restores the balance. | CL 11 Sep (later) | debit_note_payments | Record then undo. |
| FIN-003 | Settling direct with the insurer counts toward the balance; to-collect is computed from amounts everywhere, so the register and the company page always agree. | CL 11 Sep (later) | outstandingOf | Same note, same status in both. |
| FIN-004 | Over-payment is refused. | project_trs_dashboard_crm (Phase 9) | recordReceipt | Pay more than due; 400. |
| FIN-005 | The page leads with collected of billed; words are "to collect" and "past due"; statuses Settled, Part paid, Awaiting payment, Past due. | CL 11 Sep (later) | /finance | rule |
| FIN-006 | A debit note with no net amount falls back to gross when working out what is to collect. | project_trs_mailbox_privacy_home_todo (11 Nov sweep) | outstandingOf | Unit. |
| FIN-007 | Debit notes are upload-first: the insurer PDF is read, reviewed, and Approve mints DN YYMMDD, renders the TRS PDF and files it to Drive. | project_trs_dashboard_crm (11 Sep) | /debit-notes | Upload journey to review. |
| FIN-008 | Both debit-note flows fill the company from the extracted client name by exact normalised match; the picker opens prefilled when nothing matches. | CL 29 Sep | useAutoMatchCompany | Known client auto-filled. |
| FIN-009 | An insurer debit note on a client policy creates a TRS debit note in the review queue, and the work item says "Approve the TRS debit note in the review queue". | project_trs_nathan_method (3 Nov) | extract-bundle.ts | Seed insurer note; bundle needs review. |
| FIN-010 | The TRS debit note PDF has the TRS 保风 mark top-left, title in the header, one plain table with a total row, PayNow QR for SGD and the correspondent bank for USD; SWIFT reads DBSSSGSG. | project_trs_placement (29 Oct) | debit-note pdf | PDF snapshot (Phase 6). |
| FIN-011 | Billing is fixed: the client pays TRS against the TRS debit note and TRS settles the insurer; the relay adds this line when sending documents. | project_trs_nathan_method | relay compose | Draft contains billing line. |
| FIN-012 | Earnings shows commission and premium by month net of credit notes and fee rebates, top 10 by lifetime value, and renewals due in 90 days. | project_trs_dashboard_crm (2 Oct, 6 Oct) | /analytics/earnings | Unit in earnings.ts. |
| FIN-013 | Must not: red totals, overdue alarms or money warnings on any page. | CL 29 Sep | all | rule |

## Documents

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| DOC-001 | The data room classifies documents into 23 types and files them in Drive as <Company>/Policies/<policy>/<group>/, with a To sort tray, upload, and New policy from a cover note. | project_trs_placement (29 Oct) | src/lib/documents, Data room tab | Upload; filed to the right folder. |
| DOC-002 | [Standing] A file that arrives by email lands on the record itself without waiting for a person's Yes. | project_trs_rail_format (11 Nov, How to apply) | auto-attach, data room | Emailed census reaches the line. |
| DOC-003 | Attachments are stored as Drive or Gmail references, never in the retired storage bucket. | project_trs_placement (29 Oct); project_trs_dashboard_crm (2 Oct) | src/lib/storage/attachment-bytes.ts | rule: no /storage/v1 calls. |
| DOC-004 | Failed documents re-file through the daily data-room retry, which asks each mailbox for the message. | project_trs_next_actions_bar (6 Nov) | /api/cron/data-room | Retry files a 404 document. |
| DOC-005 | Password-protected insurer PDFs are unlocked before reading. | project_trs_placement (29 Oct) | src/lib/pdf-unlock.ts | Unit. |
| DOC-006 | [Standing] Mail older than 7 days on arrival is filed and deposited only; reading a mailbox's history is a supervised Claude sweep, not the agents. | project_trs_nathan_method (3 Nov, Jarod's rule) | intake isHistory | Backfilled message queues no reads. |

## Navigation

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| NAV-001 | [Standing] A top bar of flat places with a tab row under it; no drop-downs, no side rail, no phone bottom bar; a menu button below 980px. | project_trs_client_structure (31 Oct v2); nav-sections.tsx | TopBar | 390px shows the menu button. |
| NAV-002 | The places and tabs are, until Jarod decides Phase 2: Today (Today, Queue, Follow-ups, Home, Board, Calendar, Unfiled threads); Clients (Companies, People, Nexus); Inbox (Inbox, Inbound); Quotes (Employment Benefits, Requests for quotes, Insurers, RoadPlus); Claims (Claims, Second opinion); Policies (Policies, Member movements); Finance (Receipts, Debit notes, Earnings); Documents; Growth (12 tabs). | code (nav-sections.tsx, 12 Nov) | src/components/nav/nav-sections.tsx | Snapshot of PLACES. |
| NAV-003 | A path belongs to the place holding the longest matching tab href (/companies/triage is Today, /companies/<id> is Clients). | code | locate() | Unit on locate. |
| NAV-004 | Settings, Team, Activity log, Error log, AI spend, Autonomy and Kyn ROI sit under the avatar. | code | ACCOUNT_LINKS | Avatar menu lists 7. |
| NAV-005 | Must not: change the places, retire Home, Board or Queue, or hide Marketing before Jarod decides. | project_trs_refactor_plan (11 to 12 Nov) | nav-sections.tsx | rule |
| NAV-006 | [Standing] Every detail page has Breadcrumbs: current = the page's own name, fallback = its owner (the company for a policy or quotation); never a hand-made "Back to X" link. | CLAUDE.md; project_trs_refactor_plan (11 Nov) | Breadcrumbs.tsx | rule: grep for "Back to". |
| NAV-007 | Back goes to the previous trail step, else the parent; the trail travels into a new tab through the #t= hash; Back has a new-tab control; top-bar pages put themselves on the trail. | CL 11 Nov evening | src/lib/nav/trail.ts | Open quotation from thread in new tab; Back = thread. |
| NAV-008 | A link inside a page opens in a new tab; the top bar, place tabs, breadcrumbs, pagination, hash links and same-page query links keep the tab. | CL 11 Nov | NewTabLinks | Click company link; new tab. |
| NAV-009 | The bar and tab row are one sticky block with one hairline under it, its height measured into --top-nav-h so pages sit flush. | CL 11 Nov evening | TopBar | No gap under the bar. |
| NAV-010 | Old links survive renames: /group-benefits redirects to /pricing-matrix, /team to Settings, old ?tab= values alias. | project_trs_dashboard_crm (2 Oct); CL 29 Sep | redirects | Old URL lands. |
| NAV-011 | Cmd+K finds page names (record search is proposed, not built). | docs/refactor-plan.md | command palette | Cmd+K opens. |

## Agents and AI rules

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| AGT-001 | [Standing] A model reads, code computes: no premium, date, age or count comes from a model. | CLAUDE.md | all agents | rule |
| AGT-002 | Every structured model read passes through a pure normalise function that bounds and parses it. | CLAUDE.md | normalise* | rule |
| AGT-003 | Every model call goes through callGemini with a registered agent and feature; no GEMINI_API_KEY read outside ai-agents.ts. | CLAUDE.md; project_trs_ai_keys | src/lib/ai-agents.ts | ai-agents-registry.test.ts |
| AGT-004 | [Standing] Nothing sends without a person's click in the dashboard; approval happens only in the dashboard, never on WhatsApp. | CLAUDE.md; project_trs_client_structure (31 Oct) | ai_drafts | rule |
| AGT-005 | The autonomy ladder may auto-send a draft kind only after 20 unedited approvals and a person switching it on; notes, renewals, forwards, chases and money or decision drafts are excluded forever; AUTONOMY_AUTOSEND=off stops it. | project_trs_client_structure (3 Nov) | src/lib/autonomy | Unit on candidates. |
| AGT-006 | [Standing] Chase cadence: insurers 5 working days, clients 7 days, every 2 days inside 7 days of a deadline, at most 3 chases then "Call them" to a person, documents every 6 days; Monday to Friday, SG public holidays skipped. Replaces 27 Oct (3 working days, then every 2). | project_trs_next_actions_bar (6 Nov, Jarod decided); project_trs_nathan_method | src/lib/admin/b/cadence.ts | Unit on dates. |
| AGT-007 | A chase carries one ask and "Thank you!"; the third proposes a call. | project_trs_nathan_method | drafts.ts | Unit. |
| AGT-008 | Drafts use the sender's voice profile: Dear becomes Hi once the thread is warm, their sign-off, their phone on first contact. | project_trs_nathan_method | src/lib/admin/b/voice.ts | nathan-method.test.ts |
| AGT-009 | Relay emails number their asks and quote the source with QUOTE and UNQUOTE. | project_trs_nathan_method | relay/compose.ts | nathan-method.test.ts |
| AGT-010 | A newer email silently rewrites an unsent relay or case-worker draft; renewal notices and other agents keep theirs; insurer drafts are replaced only for the same address; an acknowledgement never replaces a fuller email; files carry over. | project_trs_next_actions_bar (6 Nov, Jarod decided) | relay | Unit. |
| AGT-011 | Every writing agent applies the tone of voice set in Settings, Agents, Tone of voice. | project_trs_dashboard_crm (2 Oct) | src/lib/voice.ts withVoice | rule |
| AGT-012 | Each kind of work has one main agent that hands one task per policy line to that line's desk; routing is plain code on agent_tasks, no orchestration framework; new line logic goes in a desk module. | docs/agent-routing.md (4 Nov, Jarod decided) | src/lib/agents | rule |
| AGT-013 | When Gemini has no credit, the credit guard holds the queue agents and alerts hourly in error_logs. | project_trs_agent_routing (4 Nov) | model-guard.ts | Simulate 402; agents held. |
| AGT-014 | A daily AI spend cap (AI_DAILY_CAP_USD) stops model calls for the day and logs "Daily AI spend cap reached". | project_trs_nathan_method (3 Nov); code | src/lib/ai-call.ts (do not edit) | Set cap low; 429 logged. |
| AGT-015 | Opus or deep analysis runs only on an explicit action, never on its own. | CL 10 Sep; CL 11 Sep | Nexus | rule |
| AGT-016 | A model never names TRS itself, Kyn, a bare domain or a project as a client, and never returns a cover word (WIC, D&O, GPA) as an organisation. | 74b98b94; CL 1 Oct (later) | client-link, autofile | Unit. |
| AGT-017 | Unreadable model output is logged to error_logs with its head and tail, never retried silently. | project_trs_mailbox_privacy_home_todo (10 Nov) | gb intake | Unit. |
| AGT-018 | Never set a zero thinking budget (it returns 400); size maxOutputTokens to include thinking. | project_trs_next_actions_bar; project_trs_dashboard_crm | callGemini callers | rule |
| AGT-019 | [Standing] Never handle or ask for CRON_SECRET; Jarod runs the scheduler scripts. | CLAUDE.md | scripts/*-scheduler.sh | rule |

## UI rules

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| UI-001 | [Standing] White ground; no tinted panels; no boxes around tiles. | CLAUDE.md; design-system.md | all pages | rule |
| UI-002 | Must not: a row of KPI or metric tiles; a figure sits in the section action, a table footer or the header line. [Standing] | feedback_no_kpi_tile_row | all pages | rule |
| UI-003 | Must not: rule lines between sections, under the tab row, under the away strip or under the thread header; a hairline only inside tables. [Standing] | feedback_no_section_rules; CL 11 Nov evening | all pages | rule |
| UI-004 | Must not: 1px bordered grids around stats, features or tiles. [Standing] | feedback_no_hairline_grids | all pages | rule |
| UI-005 | Must not: colour-coded state; every status is one neutral chip carrying its label. [Standing, "I HATE THE COLOR CODING"] | CL 29 Sep; project_trs_dashboard_crm (Phase 13) | all pages | rule |
| UI-006 | Must not: alert strips or warning banners. | CL 29 Sep | all pages | rule |
| UI-007 | Tabs and filters are the segmented control; no underlined text tabs. | CLAUDE.md; 273f8c0e | Segmented | rule: grep for underline tab styles. |
| UI-008 | [Standing] One primary per view and per row: row buttons are outlined secondaries of one height with one filled green primary far right; no text buttons beside other buttons; no select used as an action. | design-system.md (Buttons in a row, 11 Nov) | Btn, rail SECOND/MAIN | rule |
| UI-009 | Controls are 36px (page actions, inputs, segmented) or 30px (rows); never 44px, phone included. | project_trs_client_structure (31 Oct); project_trs_placement (29 Oct) | primitives | rule |
| UI-010 | Every table is the shared dense register: about 32px header, 34px rows, cells at 13 to 13.5px, first column inset 16px. | CL 28 Oct; CL 28 Oct (later) | src/components/ui/register.tsx | rule |
| UI-011 | The app renders at true size (--ui-zoom 1). Replaces July (1.15). | CL 28 Oct (later) | globals.css | Companies shows 16 rows at 900px. |
| UI-012 | [Standing] Every right column or drawer uses the rail format: green pill group titles, ActionItem with an uppercase eyebrow (Waiting, Chaser due, Reply due, Suggested, Held, Done), AiRow, InfoRow with a 92px label; spacing, not cards, separates. | project_trs_rail_format; design-system.md | rail-bits.tsx | rule |
| UI-013 | Dialogs are centred, about 640px wide. | project_trs_placement (27 Oct review) | dialogCls | rule |
| UI-014 | Every UI change is checked at phone, tablet and desktop (390, 834, 1440) in the same pass, with no horizontal overflow. | feedback_responsive_three_interfaces; CL 11 Sep | all pages | Layout sweep. |
| UI-015 | Must not: an explanatory grey line under a section heading; SectionCard has no description prop. [Standing] | feedback_no_subheader_descriptions; CL 29 Sep | SectionCard | rule: type check. |
| UI-016 | Must not: two tables side by side; each table gets its own full-width row. | feedback_one_table_per_row | reports, pages | rule |
| UI-017 | Must not: a section, card, tab or heading named "Exceptions". [Standing] | feedback_no_exceptions_section | all pages | rule: grep. |
| UI-018 | rounded-full only on avatars, dots and step circles; text chips use 5 to 6px radius. | design-system.md; governance.md | all pages | rule: grep. |
| UI-019 | Reuse the primitives (Btn, Chip, Segmented, Field), Breadcrumbs, rail-bits and the register; a new pattern is a decision for Jarod. | CLAUDE.md; feedback_mockups_from_existing_code | src/components | rule |
| UI-020 | Mock-ups are drawn from the current nav and components, never invented places or forms. | feedback_mockups_from_existing_code (12 Nov) | process | rule |
| UI-021 | Modals use the house motion: grey blurred backdrop fades in, panel rises and fades, reversed on close. | feedback_apple_modals ("every project") | dialogs | rule |
| UI-022 | A page container that centres with mx-auto inside a flex column carries w-full min-w-0 so phones do not overflow. | project_trs_client_structure (2 Nov) | page shells | rule |

## Copy rules

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| CPY-001 | [Standing] Headers name the thing with a noun phrase; never a question, claim or pitch. | ~/.claude/CLAUDE.md; feedback_no_taglines | all UI | rule |
| CPY-002 | [Standing] Product names are spelled out in every label, report and email: Employment Benefits, Requests for quotes; shorthand stays in code and chat. | feedback_spell_product_names | all UI | rule: grep "\bEB\b", "\bRFQ\b". |
| CPY-003 | Must not: narrative or insight sentences under charts or figures; only the number, label, period, change and an action. [Standing] | feedback_no_narrative_insight_copy | all UI | rule |
| CPY-004 | Must not: lines that reassure or defend the product. [Standing] | feedback_no_reassurance_lines | all UI | rule |
| CPY-005 | Must not: taglines, audience phrases or facts lines under a page title. [Standing] | feedback_no_taglines | all UI | rule |
| CPY-006 | Must not: the section symbol; write "Section 3". | feedback_no_section_symbol | docs, UI, reports | rule: grep for the symbol. |
| CPY-007 | Must not: the WhatsApp 24-hour window rule in any copy. | feedback_whatsapp_24h_rule | all UI | rule |
| CPY-008 | Numbers over adjectives; sentence case; one idea per sentence. | ~/.claude/CLAUDE.md; CL 29 Sep | all UI | rule |
| CPY-009 | Copy a client reads (emails, reports) is courteous and plain. | CLAUDE.md | client-draft, reports | rule |
| CPY-010 | Insurer names appear as the house writes them (Singlife, not Singapore). | e81fa1d9 | insurer-names.ts | Rail summary check. |
| CPY-011 | Labels in use: Employees (not Members), Quote from a file (not By hand), Unfiled threads, Data room, Come back later. | project_trs_placement; 273f8c0e; code | UI | Snapshot labels. |
| CPY-012 | An error shows the server's message to the user, never "Request failed (409)". | docs/refactor-plan.md (Phase 3, client saw it 11 Nov) | API client | Force a 409; message shown. |
| CPY-013 | [Standing] No client names in the public repo's commits, docs or default method text beyond what the code already carries. | CLAUDE.md; project_trs_case_spine | repo | rule |
| CPY-014 | Before shipping, grep headings for the banned words (on the table, where the money, is worth, unlock, opportunity, why this matters, game changing, powerful). | ~/.claude/CLAUDE.md | all UI | rule |

## Data integrity and working rules

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| DAT-001 | [Standing] Never modify /api/email/send; fix sends in the prepare step or the caller. | feedback_trs_send_route_locked (3 Nov); CLAUDE.md | src/app/api/email/send/route.ts | send-route-locked.test.ts |
| DAT-002 | [Standing] Never commit the local change to src/lib/ai-call.ts; never git reset --hard in this worktree; never git add -A src. | CLAUDE.md; project_trs_mailbox_privacy_home_todo; project_trs_eb_source_docs | worktree | rule |
| DAT-003 | [Standing] Deploy only on Jarod's go: clean-worktree build, the same sha to main, rfq-golive-2026-10-29 and build/integrate, wait for Vercel, check /login 200. | CLAUDE.md | deploy routine | rule |
| DAT-004 | [Standing] No test send without Jarod's go; test records use .invalid domains and are removed after. | CLAUDE.md | dogfood | rule |
| DAT-005 | After any data-touching change, run the sweeps: live policies past end, duplicate threads, duplicate companies by normalised name, quotations with an employee under 16, error_logs by feature for 7 days. | CLAUDE.md | scripts | Sweep returns zero. |
| DAT-006 | Ingest reuses any thread already aliased under the same Gmail id; one RFC 822 message never sits in two threads. | 039c7216; project_trs_mailbox_privacy_home_todo | email ingest | Duplicate-thread sweep = 0. |
| DAT-007 | Insurer-owned domains never become client domains; a learned domain must appear on two of the company's threads, never on another company's, and read like the company's name. | CL 11 Sep (later); CL 22 Sep | src/lib/crm/resolve.ts | Unit: qbe.com never learned. |
| DAT-008 | TRS's own domains (trade-risksol.com, traderisksol.com) and TRS finance (mtzholdings.com) are internal; a not-a-client list (Kyn, ISPs) is never filed as a client. | CL 11 Sep (late); project_trs_client_structure | isInternal, db.ts | Unit. |
| DAT-009 | Filing order: the client's own domain, then a client named in the subject (house shapes "(TRS) Insurer - Client", "TRS (Insurer) : Client", either side), then anything else. | CL 11 Sep (late); CL 1 Oct | resolveThread, misfiled.ts | Unit with real subjects. |
| DAT-010 | Reads that count or price page past PostgREST's 1,000-row cap (fetchAllRows). | project_trs_dashboard_crm; project_trs_next_actions_bar | src/lib/postgrest-all.ts | rule |
| DAT-011 | Selects are checked against real columns, because sbTry turns a bad column into an empty list. | CL 1 Oct (later); CL 11 Sep (later) | src/lib/crm/db.ts | rule |
| DAT-012 | email_threads.message_count is never trusted; counts come from message rows. | CL 11 Sep (night) | thread lists | rule |
| DAT-013 | Confirm scope with Jarod before deleting a named person's data on ambiguous wording. | feedback_confirm_data_wipes | ops | rule |
| DAT-014 | Every data backfill or repair writes an undo file first. | project_trs_claims_backfill; project_trs_insurer_contacts | scripts | rule |
| DAT-015 | API functions run in Singapore (vercel.json regions sin1); Inbox list about 1 s, board about 1.5 s. | CL 11 Nov; project_trs_vercel_region | vercel.json | x-vercel-id shows sin1. |
| DAT-016 | Every commit keeps npm run check green; a lint error fails the build and the deploy. | CL 11 Nov (later) | CI | dashboard-check workflow. |
| DAT-017 | Money, dates and ages are formatted by src/lib/format.ts; copies inside PDFs, emails and CSV exports change only after snapshot tests exist. | CL 11 Nov (later); project_trs_refactor_plan | src/lib/format.ts | rule |
| DAT-018 | Every /api route sits behind the API gate (x-api-key plus session or cron credential). | CL 30 Sep; project_trs_dashboard_crm | middleware | API-gate coverage check. |
| DAT-019 | Migrations grant to service_role only (Cloud SQL has no auth schema); PostgREST schema is reloaded after a new table. | project_trs_client_structure (1 Nov); project_trs_marketing_v2 | supabase/migrations | rule |

## Growth

| ID | Behaviour | Source | Where | Test |
| --- | --- | --- | --- | --- |
| GRO-001 | Every Marketing page carries a site switch kept in ?site=. | CL 12 Oct; project_trs_marketing_module | /marketing/* | Switch persists on reload. |
| GRO-002 | A site's banned terms hold an article from publishing even when approval is off. | CL 12 Oct | content engine | Article with a banned term held. |
| GRO-003 | Campaigns approve every recipient before scheduling, send 15 minutes apart in office hours, cap 30 a day (max 45), stop on reply or bounce, pause over 5% bounces, offer one-click unsubscribe, and send nothing until CAMPAIGN_SENDING_ENABLED. | CL 12 Oct (Sales) | /sales/campaigns | Unit on scheduler. |
| GRO-004 | The knowledge file is read-only until Edit; Save makes a version; old versions can be viewed and restored. | project_trs_marketing_v2 | /marketing/knowledge | Save twice; restore v1. |

---

## Conflicts to resolve

1. docs/changelog.md 12 Nov (packages, fifteen prices, "EB" labels, rail "EB analysis" with Analyse) is older than c14bc020 and f4b1bb14 (Employment Benefits spelled out, packages removed, current cover first, rail opens the census picker). The changelog needs a 12 Nov afternoon entry.
2. CLAUDE.md section 5 still describes "EB pricing estimate" building Like for like, Lower cost and Enhanced on Yes. The code now offers "Employment benefits analysis" with Open census, and nothing runs unattended.
3. design-system.md (top half) says navy accent, tinted table header, tinted callout banners and filter pills. Later rules: green primary (29 Oct), no alert strips and no colour coding (29 Sep), segmented control for filters.
4. docs/placement.md and CL 27 Oct: placement-chase cron at 09:30, chase after 3 working days then every 2, one email per underwriter. Later: cron deleted for cadence.ts (5 working days insurer, 7 days client), one draft per line fanned out per recipient.
5. AI daily cap: memory says default USD 7.5 then 5; code says off unless AI_DAILY_CAP_USD is set.
6. CLAUDE.md "Nothing sends without a click" versus the autonomy ladder auto-send (AGT-005).
7. Home: 3 Nov Home canvas uses red, amber and green pending states, against the no colour coding rule (UI-005).
8. HR connect discards salary; f4b1bb14 reads monthly salary from the census for life cover multiples.
9. 2 Oct: comparison deterministic, "no score, no winner"; same day Jarod allowed a value score and AI narrative on Pricing Matrix only; the 12 Nov report shows a suggestion.
