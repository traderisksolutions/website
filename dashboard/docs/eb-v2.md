# Employment Benefits v2: the scheme file, two pricing routes, one product library

Written 20 Nov 2026 from a read of `main` at `66124ee7` and the live database. The goal set by Jarod: **no administrative grunt work left for a person in the EB flow**. People review, decide and send. Code gathers, files, reads, checks, prices and drafts.

This is a map and a gap list, not a finished design. Every gap has an ID (G1…G30) so work can be split and tracked. Standing rules in `CLAUDE.md` still apply: AI is manual until Jarod says otherwise, nothing sends without a click, a model reads and code computes, no client names in commits.

---

## 1. Where the flow stands today

| Step | Today | Where |
| --- | --- | --- |
| Find the files | `/eb` lists spreadsheets, and PDFs whose **filename** matches `schedule\|endorse\|debit\|invoice\|policy\|renewal…`, from the company's threads of the last 18 months | `api/group-benefits/census/sources` |
| Census | Excel/CSV only, read by code; the broker picks the file | `census/read`, `lib/gb/census-parse.ts` |
| Last year's policy | Broker picks or uploads; one model call on a button; saved on that quotation only, never reused | `last-year/read`, `lib/gb/last-year.ts` |
| Prices on `/eb` and Compare cover | House workbook (Nathan's TRS EB Calculator V1.2): 5 products, 1,549 rates, 1,203 benefit rows, typed by hand; file dated 2 Oct, imported 12 Nov | `app_settings.gb_workbook`, `lib/gb/workbook.ts`, `eb-price.ts`, `compare-cover.ts` |
| Prices in placements and analysis | A second, separate store: 7 rate tables, 2,474 rates, 1,663 benefits, read from brochures (incl. Cigna; AIA plan year 2025; Singlife 2022) | `gb_rate_tables`, `gb_rates`, `gb_benefits`, `lib/placement/eb.ts`, `lib/gb/analysis.ts` |
| Rules | Spread over four files, several hard-coded | `plan-pairs.ts` (app_settings), `underwriting.ts` (constants, 29–30 Oct), `table-version.ts` (`PACKAGE_LIMITS`), `rules-extract.ts`, `custom-quote.ts` |
| Storage | Three Drive places: data room `<Group>/Policies/<period · insurer>/<cover>`, last-year uploads `group-benefits/last-year`, `<company>/Employment Benefits`; two service accounts (`GOOGLE_TRS_DRIVE_SA_JSON` = ai-engagement@trs-ai-project; `GOOGLE_SERVICE_ACCOUNT_JSON` belongs to another organisation's project) | `lib/documents/drive.ts`, `lib/gb/drive.ts`, `api/group-benefits/folder` |
| OneDrive | Delegated per person, used only for the historical debit-note import. No SharePoint, Box or Outlook | `lib/onedrive.ts` |
| Proposal | `/eb` → kept quotation (`eb_quotations`, 1 row) → proposal PDF → email; ProposalTrack per company | `lib/gb/eb-proposal*.ts`, `components/eb/` |
| Automation | AI manual (`ai-gate.ts`). **Mail filing** (thread → company: signature reads, company from domain or subject, autofile, resolver, nightly client-link sweep, the EB intake hand-off) is off unless `HOUSEKEEPING=on` (`66124ee7`, Jarod 20 Nov). **Document filing** (the data room: each attachment typed and copied into the client's Drive folder) still runs daily (`/api/cron/data-room`, 10:45 SGT); with AI manual it types by filename rules only | |

**Data TRS already holds and the EB flow does not use** (live counts, 20 Nov):

- Data room `policy_documents`: 14,403 rows. 243 member lists, 364 policy schedules, 305 insurer debit notes, 251 renewal notices, 295 quotations, 258 benefit summaries, 80 member movements, 47 claims histories, 75 endorsements, 70 broker appointments.
- Data room state: 72% typed `other`; 6,385 need review; 1,245 unfiled; 4,126 in Drive.
- `email_attachments`: 16,048, of which 5,420 have no text (scans, images, protected files).
- Policy register: 13 EB policies (`employee_benefits` 11, `group_health` 2); 344 policies have no product line.

---

## 2. v2 in one picture

```
 SOURCES                 FILE RECORD                       SCHEME FILE (company × plan year)        OUTPUT
 Gmail (3 mailboxes) ┐                                     ┌ Census      versions · checks · changes ┐
 Upload / HR link    ├─→ fingerprint → type → fields  ─→   ├ Last year   plans · premium per cover   ├─→ /eb opens filled in
 Drive drop folder   │    + confidence → filed in Drive    ├ Optional    billing · claims · other    │   Today: "ready to review"
 OneDrive/SharePoint ┘                                     └ Quotes      brochure + insurer          ┘   Proposal · insurer forms · bill audit
                              PRODUCT LIBRARY (read once per insurer card)
                              rates · plans · benefits · rules · discrepancies, each with source + checked status
```

What a person experiences: a renewal email arrives. Without anyone touching it, the thread is filed to the client and the files go into the client's EB folder. The census is read, checked and compared with last year's. Last year's plans and premium come from the scheme file, not a fresh read, and the insurer's renewal terms are read. Every insurer gets a route (§5): brochure-priced insurers are priced at once, and insurers needing a quote get a drafted request. Today shows **"<Client> EB renewal: ready to review"**. The person reviews, approves and sends.

---

## 3. The file record (shared groundwork)

One record per incoming file, whatever its source.

| Field | Content |
| --- | --- |
| fingerprint | SHA-256 of the bytes (and Drive md5 when from Drive); one stored copy however many emails carry it |
| source | gmail (mailbox, message) · upload (person) · hr_link · drive_drop · onedrive |
| doc_type | the data-room taxonomy (`documents/taxonomy.ts`), EB types first: census, member_list, member_movement, policy_schedule, endorsement, benefit_summary, renewal_notice, quotation, insurer_debit_note, credit_note, claims_history |
| company / scheme / policy | matched by rule first (sender domain, policy number, insured name), then the agent |
| fields | per field: value, the text it came from, page, confidence, read by (code · model · person) |
| status | read · needs_check · confirmed |
| drive | file id and path in the client's tree (§4) |

**Confidence is computed by code, never the model's own number.** Both vendor research and practice say a model's self-rating is the weakest signal. The checks:
- the value appears word for word in the document
- code and model agree
- premium + GST = total
- dates are in order
- the policy number fits the insurer's format
- headcount matches the census
- the figure matches the insurer's own rate × members (`custom-quote.ts`)

Critical fields (premium, period, headcount, plan) below the threshold send the record to **To check**.

**Reading order:**
1. Code first, at ingest, free: `pdf-parse`, `census-parse.ts`, `members-read.ts`, `money.ts`, `quote-read.ts` patterns, `classifyByName`.
2. A model read only for scans or low confidence. It stays on a button until Jarod changes the AI rule (§9, decision D1).
3. People confirm. A confirmed field is 1.0, and corrections are kept as examples for the readers.

---

## 4. Drive: one tree, one TRS service account

```
<Group>/Employment Benefits/<2026–27 · Insurer>/
    Census/     census versions, insurer member listings
    Policy/     schedule, endorsements, benefit summary, renewal notice
    Billing/    debit and credit notes, movement lists
    Quotes/     insurer quotations, TRS proposal versions (PDF kept as sent)
    Claims/     claims history, TPA reports
    Other/      client requirements, correspondence worth keeping
<Group>/To sort/   not yet matched
```

- `<Group>` = top of `companies.parent_id`, as the data room does today (`groupFolderName`).
- Written by the TRS service account only (`GOOGLE_TRS_DRIVE_SA_JSON`); retire `GOOGLE_SERVICE_ACCOUNT_JSON` for client documents.
- The last-year upload folder and `<company>/Employment Benefits` merge into this tree; links already stored keep working (Drive ids do not change on move).
- A **drop folder** per group (`<Group>/Employment Benefits/_Drop`) is watched: a file put there by a person becomes a file record like an email attachment.
- OneDrive/SharePoint: an organisation-level Microsoft Graph app (application permission, one admin consent) instead of per-person tokens, watching one agreed folder per client or a shared "EB inbox" folder. Box later, same pattern.

---

## 5. The quotation, step by step

### Step 1 · Documents: three columns

| Census (required) | Last year's policy (required for a renewal) | Optional: add if any |
| --- | --- | --- |
| Pre-filled from the scheme file: newest census, insurer member listing, HR link upload | Pre-filled: schedule, endorsements, debit note, renewal notice | **Billing**: debit/credit notes, movement lists |
| Or pick from emails, or upload (Excel, CSV, **PDF**) | Or pick or upload | **Claims**: claims history, TPA reports |
| Census checks and changes vs last year shown here | Premium per cover is the anchor | **Other**: client requirements, insurer letters |

- Each column is pre-filled from the scheme file. The broker adds or removes files, and every file lands in the Drive tree under its folder.
- The optional column never blocks a quotation.
- Filled-in billing files switch on bill checks (headcount on the bill against the census). Filled-in claims files switch on claims against premium.

### Step 2 · A route per insurer, decided by code, with the reason shown

| Insurer | Route | Why |
| --- | --- | --- |
| Income FlexCare | Brochure price | Card in force for 1 Jan 2027 · 38 employees, within 2–100 |
| QBE MCare+ | Insurer to quote | 62 employees, above the package limit of 50 |
| AIA | Insurer to quote | 2 lives over the age limit need underwriting |
| Great Eastern | Insurer to quote | No card on file |

An insurer is **brochure priced** only when all of these hold:
1. A card is in force for the effective date and basis (new business or renewal), per `table-version.ts`.
2. Headcount is within `PACKAGE_LIMITS` (QBE ≤ 50, Income 2–100, Singlife ≤ 100, Cigna 2–9).
3. No life needs underwriting (`underwriting.ts`: free cover limit, age).
4. Every requested cover and plan is on the card. A custom ward, limit or rider means a quote.
5. The scheme isn't one the insurer rates on its own terms: a renewal with custom per-head rates or a renewal load (`custom-quote.ts`).

Otherwise the insurer is **Insurer to quote**, with the failing reason. A broker can override, and the override is recorded. One quotation can mix both routes, and the comparison fills in as quotes come back.

Build: one pure `routeFor(insurer, census, design, effectiveDate, basis) → { route, reasons[] }` over the existing rules, tested.

### Step 3a · Brochure price: immediate
1. Prices come from the product library (§6), in code, at once.
2. Compare by category and cover, with last year as the anchor.
3. **Proposal PDF → Send to client** (email or WhatsApp link). This exists: `eb-proposal-pdf.tsx`, `/eb/proposal/<id>/email`.
4. ProposalTrack moves to "Proposal sent".

### Step 3b · Insurer to quote: back and forth
1. **Request.** A drafted email per insurer, with the census in that insurer's template (`insurer-forms.ts`, 2 insurers today), the covers wanted and last year's terms. One click sends.
2. **Track per insurer.** Requested · chased · quoted · declined · revised, with follow-up dates from the placement module (`chaseDue`).
3. **Quote in.** From the reply on the thread, or **uploaded as Excel or PDF**. It becomes a file record: premium per cover per category, plan or cover per cover (ward, limits, co-pay), conditions and exclusions, validity, each with confidence and source line. Excel is read by code. A PDF is read by code when it has text, and by the Read button when scanned.
4. **Checks.** The insurer's figure against its own rate × members. Cover against what was asked. The difference from last year and from the brochure price.
5. **Comparison.** Insurer quotes beside brochure prices on the same cover rows and categories (`compare-quotation.ts` already does this on the canon, by code). A revised quote replaces the old one, and both versions are kept.
6. **Proposal PDF → Send**, as in 3a.

### Step 4 · After binding (optional inputs, automatic checks)
- **Bill audit:** the first debit note against the accepted quotation's rates × census. It flags differences, people billed after leaving, and members missing from the bill, rated by severity.
- **Movements:** a joiner or leaver is followed through to an endorsement and its debit or credit note.
- **Claims experience:** claims against premium per scheme per year, for the next renewal talk.

---

## 6. The product library: read every brochure once

One store replaces both the house workbook and `gb_rate_tables` as the price source for `/eb`, Compare cover, placements and analysis.

| Part | Content |
| --- | --- |
| Card | insurer · product · version · in force from (new business) / from (renewal) · source files (Drive id, md5) · checked status (`verification.ts`: calculator / brochure / unverified) |
| Rates | cover · plan · age band · class · basis · employee/dependant · net/GST |
| Plans and benefits | each benefit on the canon (`gb/canon.ts`, `gb_label_alias`) with value and brochure page; the bounded read in `gb/ingest.ts` |
| Rules (one store, data not code) | plan pairing and required riders, covers priced inside another, package size limits, minimum group size, free cover limit, age limits, underwriting triggers, dependant rules (child factor, family tiers), renewal load, loadings and discounts, minimum premium, pro-rating, GST. Each rule has a source (page or cell) and a checked status |
| Discrepancies | where brochure, calculator, house workbook and insurers' real quotes disagree, each with the evidence and the decision taken (e.g. QBE MCare+ V12 renewal on the newest card overstated by 19–31%; 4 Nov reverse-engineering) |

**Reading once:**
1. A file is dropped in the brochure folder. `gb/sources.ts` already reports "not read" and "changed".
2. It joins a **Read queue**.
3. A person presses Read. Calculators are read by code, including formulas (`rules-extract.ts`, `api/pm_dump.py`). Brochures get one model read bounded by the canon.
4. The result is compared with the current card, and every difference is listed with its source.
5. A person approves, and the card goes live from its in-force date.

**The proof before a card goes live:** the library reproduces the insurer's own calculator to the cent, and reproduces Nathan's workbook figures for the 5 house products (the Gembridge case in `docs/gb-pricing-method.md`).

---

## 7. UI/UX: how the leaders do it, and the TRS version

What the research shows (AI insurtech, document-AI review tools, agent UX guidance, Linear):

1. **The review screen is the product.** The source document sits beside the extracted fields. Clicking a value highlights where it came from. Each field has a confidence mark, and the reviewer confirms or corrects in one click (Reducto returns bounding boxes and confidence per value; open-source review tools copy this layout).
2. **Thresholds per field, not per document.** Any critical field below threshold sends the document to the queue. High-confidence fields don't ask for attention.
3. **Show the candidate, even when unsure.** A proposed value with its source is faster to check than an empty box.
4. **Citations on every figure** (FurtherAI, Allianz's underwriting assistant): source, reason and audit trail.
5. **Approve where it matters, not everywhere.** Reading and drafting run free; sending and binding pause for a person. Asking too often trains people to click through. The approval card says why approval is needed, with Approve / Change / Reject.
6. **One queue, a clear state per item** (Linear): opinionated statuses, keyboard-first, everything feels instant (optimistic updates, cached reads).
7. **Comparison tables built for the decision:** the same rows across options, differences marked, the anchor (today's cover) shown, totals pinned.

**The TRS version** (within `docs/design-system.md`: white ground, hairlines only inside tables, segmented controls, one primary button per view, numbers over adjectives, no KPI tiles, no explanatory sentences under figures):

| Screen | What it shows | The one primary action |
| --- | --- | --- |
| **Today › EB** | One row per scheme: client · renewal date · state (Collecting · Ready to review · Waiting on insurers · Proposal sent · Bound) · what it waits on | Open |
| **Quotation › Documents** | The three columns (§5 step 1). Each file shows its type, source and date, plus a green/amber/red mark for its fields. Amber/red opens the review panel. Census issues are listed as plain sentences ("2 children over 25", "Headcount 41; bill says 44") | Continue |
| **Review panel** (any file) | The document on the left with the source highlighted; fields on the right with confidence marks; keyboard ↑/↓ between fields, Enter to confirm, type to correct | Confirm all |
| **Quotation › Insurers** | One row per insurer: route · reason · state · premium · validity. Brochure rows priced; quote rows show requested/chased/quoted. Upload a quote on the row | Send requests (when any are drafted) |
| **Quotation › Compare** | Categories × covers; today (anchor) first, then each insurer; differences marked; total pinned; source of each price (Brochure · Insurer quote, with its file) | Prepare proposal |
| **Proposal** | The PDF as the client will see it; checks before sending (commission blank in attachments, figures match the comparison, validity in date) | Send to client |
| **After binding** | Bill audit result, movements pending, claims ratio | Resolve (per issue) |

Copy: say what something is and what it waits on. Name the person or insurer, give dates as `fmtDay`, and use money via `lib/format.ts`.

---

## 8. Gaps

**Intake**
- **G1** `/eb` finds files by filename regex, not data-room type: 243 member lists, 364 schedules, 305 debit notes and 251 renewal notices are never offered.
- **G2** Only the company's threads of the last 18 months. Unlinked threads, Drive files and past uploads are missed.
- **G3** A PDF census and insurer member listings can't be used as a census, although `members-read.ts` parses listing PDFs by code.
- **G4** Scans are never read (5,420 attachments without text). There's no Read button.
- **G5** Document filing types by filename only while AI is manual: 1,245 unfiled, 6,385 needing review, 72% `other`. Mail filing (thread → company) is off by Jarod's switch, so EB files on threads not yet filed to a company are not found.
- **G6** Duplicates are matched by filename and size only. There's no content fingerprint.
- **G7** No watched drop folder for client files (only the brochure folder is listed).
- **G8** OneDrive is per person and debit notes only. No organisation-level SharePoint/OneDrive, no Box.

**Storage**
- **G9** Three Drive places, two service accounts.
- **G10** No scheme file per company per plan year. Every quotation starts from nothing.
- **G11** Only 13 EB policies on the register, and 344 policies have no product line, so renewals due can't be listed.

**Product library**
- **G12** Two price sources (house workbook, `gb_rate_tables`) that can disagree, never reconciled. Some tables are stale (AIA 2025, Singlife 2022).
- **G13** 5 products priced on `/eb`, and Term Life isn't priced there. Great Eastern, Allianz, HSBC Life, Tokio Marine and others only go by email.
- **G14** Rules live in 4 files, several hard-coded, so changing one needs a deploy.
- **G15** No discrepancy register. What TRS has learned lives in code comments.
- **G16** Brochure benefit reads (`gb/ingest.ts`) and workbook BenefitData aren't merged.
- **G17** A changed brochure is detected but nothing queues it for re-reading.

**Making sense**
- **G18** Last year's policy is re-read every year, kept on one quotation, and not checked against debit notes on file.
- **G19** No census changes against last year. No census check list (duplicate NRIC/FIN, child over age limit, spouse without employee, missing date of birth, category without plan, headcount against the bill).
- **G20** Insurers' EB quotes (`placement_quotes`) aren't on `/eb` beside engine prices, and aren't reconciled with them.
- **G21** Renewal notices (insurer renewal terms) aren't read into the flow.
- **G22** At most 4 categories. Dependants are priced on medical covers only.
- **G23** Two quotation screens: `/eb` (workbook) and `/pricing-matrix/new` (rate tables).
- **G24** No route per insurer. Brochure price and insurer quote aren't told apart on screen.
- **G25** There's no upload-and-read path for an insurer's quotation file (Excel/PDF) into premium per cover and cover terms.
- **G26** No per-insurer status on a quotation (ProposalTrack is per proposal).

**After binding**
- **G27** No bill audit, no movement → endorsement → debit note check, no claims experience per scheme.
- **G28** Insurer templates for only 2 insurers.

**Automation and UX**
- **G29** No per-field review panel (source highlight, confidence, keyboard confirm).
- **G30** Full automation is bounded by the two standing switches: AI manual (D1) and mail filing off (D2). Everything code can do runs by itself; every model read is a button.

---

## 9. Decisions (Jarod, 20 Nov 2026)

| | Decision | What it means for the build |
| --- | --- | --- |
| **D1** | **Keep the button.** Model reads run only when a person presses Read. | Code readers run on everything at ingest. Scans, brochures, last year's policy and insurer quote PDFs show a **Read** button with what is waiting. The To check queue counts what still needs a read. Nothing calls a model by itself. |
| **D2** | Open. Mail filing (thread → company) stays off by Jarod's switch. | The EB flow uses **document filing by rule** (no model), which already runs: type by filename and text patterns, match by policy number, insured name and the thread's company, copy into the Drive tree. Files on threads not filed to a company wait in `<Group>/To sort` or the To check queue until a person files the thread. |
| **D3** | **Nathan's workbook is v0, the source of truth.** Much of the logic lives in its cells. | The product library starts **from the workbook**: its Rates, Lists and BenefitData sheets, and its formulas (loadings, rounding, age basis, dependant rules), read cell by cell into rules with the cell reference as the source. `gb_rate_tables` and brochure reads are **checked against** the workbook, never replace it; a difference goes to the discrepancies list for Nathan to settle. The workbook stays editable by Nathan; a changed workbook is re-imported and diffed. |
| **D4** | **Build the Microsoft connection now; approval comes later.** | Build the organisation-level Graph connector (OneDrive/SharePoint folder watch → file records) behind a switch, tested with a test tenant or a personal connection. It stays off until the connection is approved. |
| **D5** | **Confirm the Drive layout; move the existing EB folders and sort by company.** | One job: list every EB file in the three current places (data room, `group-benefits/last-year`, `<company>/Employment Benefits`), show where each will go in the §4 tree as a dry run for a person to check, then move (Drive ids do not change, so stored links keep working). Files with no company land in `To sort`. |

## 10. Order of work

| Phase | Closes | Done when |
| --- | --- | --- |
| P1 File record, fingerprint, one Drive tree and the move of existing EB folders (D5), filing by rule for EB types, Read button (D1) | G1–G6, G9, G29 (first cut) | A census, schedule or debit note on any email filed to a company appears typed and filed, with fields and confidence, without anyone picking it; existing EB files sit in the new tree |
| P2 Scheme file and the three columns on `/eb` | G10, G11, G18, G21 | `/eb` for a renewing client opens filled in: census, last year's policy, optional files |
| P3 Product library from Nathan's workbook (v0, D3): cells and formulas into rates and rules with cell references; `gb_rate_tables` and brochure reads checked against it; discrepancies; read queue | G12–G17 | `/eb`, Compare cover and placements price from one store built from the workbook; Gembridge reproduces to the cent; every difference from the rate tables is listed |
| P4 Census engine | G3, G19, G22 | PDF and listings usable; check list and changes against last year shown |
| P5 Routes and insurer quotes | G20, G23–G26 | Each insurer shows route and reason; an uploaded insurer quote lands in the comparison; one quotation screen |
| P6 After binding | G27, G28 | First debit note audited automatically; movements followed |
| P7 New sources (D4: build now, switched off until the Microsoft connection is approved) | G7, G8 | Drop folder and SharePoint files become file records |

Every phase: `npm run check`, a journey per behaviour (`tests/journeys/`), entry in `docs/changelog.md`, deploy only on Jarod's "ok deploy".

### P7 status (21 Nov 2026)

| Gap | Status | What exists |
| --- | --- | --- |
| G8 Microsoft folder watch | **Built, switched off** | src/lib/microsoft: client-credentials Graph app, delta read of one folder, files into the data room and the Drive tree. Needs MS_GRAPH=on, MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_WATCH_DRIVE_ID (and MS_WATCH_FOLDER), and a schedule (docs/expenses.md). Not tested against a real tenant. |
| G7 Drive drop folder | Not done | |

### P6 status (21 Nov 2026, EB-076)

| Gap | Status | What exists |
| --- | --- | --- |
| G27 Bill audit, movements, claims | **First cut** | Employment Benefits › After binding. 21 Nov: 43 EB policies; 2 have a quotation or policy premium to check the bill against (41 have neither); 64 movement lists on 18 policies, 2 followed by an endorsement note within 60 days; 196 claims, a loss ratio on 15 policies. Member-level bill audit (people billed after leaving) needs the insurer's member listing read per bill: not built. |
| G28 Insurer templates | Not done | |

### P3 status (21 Nov 2026, branch eb-library-2026-11-21, EB-073)

| Gap | Status | What exists |
| --- | --- | --- |
| G12 Two price sources | **Compared** | Employment Benefits › Products sets the workbook against every rate table rate by rate. 21 Nov: RCC 291 of 291 same; QBE V12 brochure 381 same, 12 different (dental); QBE calculator table 362 of 393 different; Singlife 2022 table 142 different; Income and AIA differences mostly the same price with 9% GST. |
| G15 Discrepancy register | **First cut** | The differences are computed live, not stored; no decision is recorded yet. |
| G17 Changed brochure queued | **Done** | The read queue lists files not read and changed since. |
| One price source for placements and analysis | Not done | They still price from the rate tables; switching follows Nathan settling the differences. |
| G14 Rules as data, G16 benefits merged | Not done | |

### P2 and P4 status (21 Nov 2026, branch eb-scheme-2026-11-21, EB-071, EB-072)

| Gap | Status | What exists |
| --- | --- | --- |
| G1 Files by type | **Done** | The census, policy and insurer columns offer the data room's typed documents for the client as well as name matches. |
| G10 Scheme file | **Done** | `eb_schemes`, one row per client per plan year (20261121_v2_eb_schemes.sql); /eb opens the newest plan year filled in. |
| G18 Last year re-read | **Done** | Last year's policy read is kept in the scheme file and reopened, not read again. |
| G19 Census checks and changes | **Done** | Seven checks by code; joined, left, changed category against the previous plan year. |
| G11, G21 | Not done | EB policies on the register; renewal notices read into the flow. |
| Optional column | **Listed** | Billing and claims files on record are listed with links; bill checks wait for P6. |

### P5 status (20 Nov 2026, branch eb2-2026-11-20, EB-063 to EB-070)

| Gap | Status | What exists |
| --- | --- | --- |
| G20 Insurer quotes beside engine prices | **Partly done** | An insurer's schedule added on /eb (Insurer pricing) is read and compared beside the brochure columns, figure by figure with source and status. The placement module's Employment Benefits quotes for the client are listed on the proposal page (EB-075); not yet columns in Compare. |
| G23 Two quotation screens | **Done** | /eb is the one quotation screen (release 1, EB-055); Brochure and Insurer pricing are two modes of it. |
| G24 Route per insurer | **Done (21 Nov)** | `routeFor` (gb/routes.ts): Brochure price or Insurer to quote per house insurer with the reasons, shown as Routes under the census (EB-074). A broker's override is recorded with its reason on the proposal page (EB-075). |
| G25 Upload and read an insurer quotation | **Done** | xlsx, xls, csv and PDF read by code; Read with AI for scans; every figure with source and status (EB-065). |
| G26 Per-insurer status | **Done (21 Nov)** | Proposal page › Insurers: status per insurer with each step's date and a note (eb_quotation_insurers, EB-075). |

Also moved: G3 (a census PDF is read by code, Read with AI for scans: EB-064); G13 (term life, critical illness and EAP priced from the house workbook: EB-069).

---

## Sources (research, 19–20 Nov 2026)

- Outmarket Employee Benefits 2.0: https://outmarket.ai/platform/benefits
- Cassidy for employee benefits: https://www.cassidyai.com/solution/employee-benefits ; renewal blog https://www.cassidyai.com/blog/how-cassidy-replaces-the-renewal-marketing-grind-for-benefits-brokers ; census blog https://www.cassidyai.com/blog/the-census-problem-how-ai-is-fixing-benefits-biggest-bottleneck
- FurtherAI on underwriting review and citations: https://www.furtherai.com/blog/ai-for-underwriting ; https://www.furtherai.com/blog/from-basic-automation-to-ai-agents-transforming-insurance-submission-processing
- Marsh Broker WorkBench: https://www.insurancejournal.com/news/international/2026/09/22/886374.htm
- Confidence and review UI: https://www.nutrient.io/blog/document-extraction-confidence-scores/ ; https://lilting.ch/en/articles/human-in-loop-document-extraction-confidence ; https://github.com/CornerMan-Hyacinth/extraction-review ; https://dev.to/nabeelbaghoor/your-extraction-is-98-accurate-one-document-in-three-still-needs-a-human-41m3
- Agent approval UX: https://www.stackai.com/insights/human-in-the-loop-ai-agents-how-to-design-approval-workflows-for-safe-and-scalable-automation ; https://hatchworks.com/blog/ai-agents/agent-ux-patterns/ ; https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system
- Linear's approach: https://www.figma.com/blog/the-linear-method-opinionated-software/ ; https://linear.app/now/behind-the-latest-design-refresh
- Comparison tables: https://blog.logrocket.com/ux-design/design-feature-comparison-tables ; https://baymard.com/research/insurance
