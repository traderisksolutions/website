# Components inventory

One component per UI job. This file lists every place a job is implemented more than once, the one to keep, and what the others do that it must absorb before they are deleted.

Taken 13 Nov 2026 from the working tree. Read-only sweep; no code changed.

## Method

- **Importers** = files under `src/` (tests excluded) with an `import … from` naming the module by alias or relative path. When a symbol is named (for example `primitives › Btn`), only importing files that also use that symbol are counted.
- **Uses** = occurrences of the JSX tag (`<Btn`, `<Register` …) across `src/**/*.tsx`.
- **Raw button / table counts** come from a tag scanner (`<button …>` opening tags parsed to the closing `>`), not line counts.
- "Dark-filled button" = a raw `<button>` whose own tag sets a background of `#132c1c`, `#0f1412`, `#1a3a26`, `var(--trs-ink)`, a local `INK`/`GREEN` constant, `bg-trs-ink`, `bg-trs-green`, `bg-primary` or `bg-foreground`. Hover-only backgrounds are excluded.
- Line numbers point at the definition or the first line of the hand-rolled block.

## Baseline usage of the shared primitives

| Primitive | File | Importing files | JSX uses |
| --- | --- | --- | --- |
| `Btn` | `src/components/crm/primitives.tsx:82` | 79 | 326 |
| `Chip` | `primitives.tsx:23` | 54 | 145 |
| `Segmented` | `primitives.tsx:101` | 49 | 75 |
| `inputCls` | `primitives.tsx:136` | 46 | |
| `Spinner` | `primitives.tsx:60` | 43 | |
| `Empty` | `primitives.tsx:56` | 30 | |
| `Field` | `primitives.tsx:126` | 27 | |
| `SectionCard` | `primitives.tsx:39` | 23 | |
| `LinkBtn` | `primitives.tsx:91` | 9 | |
| `btnClass` | `primitives.tsx:79` | 1 | |
| `StageBadge` | `primitives.tsx:33` | 0 | |
| `Register` | `src/components/ui/register.tsx:31` | 51 | 80 |
| `RegisterEmpty` | `register.tsx:132` | 31 | |
| `Dialog` | `src/components/ui/dialog.tsx` | 24 | 30 |
| `Breadcrumbs` | `src/components/nav/Breadcrumbs.tsx` | 15 | |
| `PageHeader` | `src/components/page-header.tsx:16` | 15 | |
| `money` / `fmtDate` / `timeAgo` | `src/lib/format.ts` | 38 (module); 8 / 15 / 7 by symbol | |

---

## 1. Company picker

**Canonical: `CompanyField`** (`src/components/group-benefits/CompanyField.tsx:17`, 3 importers: `NewEb`, `QuickQuote`, `hr/SendLinkDialog`).
Why: server search on `/api/companies?search=` (no full list in memory), debounced, keyboard (arrows, Enter, Escape), `role="listbox"`/`option`, optional "Add as a new company" (`POST /api/companies`), free text kept with `id: null`. Uses `Field` + `inputCls`.

| Implementation | Location | Importers | What it does |
| --- | --- | --- | --- |
| `CompanySearchSelect` | `src/components/crm/CompanySearchSelect.tsx:14` | 1 (`companies/triage/page.tsx:316`) | Filters a client-side `options` array on name and domain; shows the domain under each name; keyboard. |
| `CompanyContactPicker` | `src/components/company-contact-picker/CompanyContactPicker.tsx:37` | 3 (`debit-notes/new`, `debit-notes/historical`, `useAutoMatchCompany.ts` type only) | Company search + create, then a contact/email half ("+ add new email", saves at once); `hideContact`, `initialQuery`. Built on `ui/field` + `ui/input` + `ui/button`, not the primitives. |
| `LinkCompanyPopover` | `src/components/engagement/LinkCompanyPopover.tsx:16` | 2 (`ThreadHeader`, `ContextRail`) | Same `/api/companies?search=` typeahead inside `ui/popover`; on pick, links the thread. |
| Inline typeahead in `CreateCaseModal` | `src/app/nexus/cases/page.tsx:488` (fetch at `:510`, input `:567`) | n/a | Fourth copy of the `/api/companies?search=` fetch; find-or-create by name server-side; locked when prefilled. |
| Inline client search in `CaseEditor` | `src/components/assistant/CaseEditor.tsx:62` | n/a | Search via `/api/today/edit-options?q=`; list of buttons; chip shows current client. |
| Native `<select>` of every company | `src/app/ask/page.tsx:146` | n/a | Loads `/api/companies/triage`, renders all names in a select ("No client named"). |
| Free-text company input | `src/app/contacts/page.tsx:160` | n/a | Plain `Input`, no lookup; creates contacts with an unlinked company string. |

Out of scope: `connect/[token]/simplepay/page.tsx:74` (a SimplePay company list, not TRS companies).

**Migration note.** `CompanyField` must gain before the others go:
- `domain` line under each hit (`CompanySearchSelect`); the API already returns `domain`.
- An optional `options` prop or `kind` filter, so triage can restrict to its list without the client-side array.
- `initialQuery` and a `locked` state (`CompanyContactPicker`, `CreateCaseModal`).
- An `onPick` callback mode so `LinkCompanyPopover` becomes `Popover` + `CompanyField` + its link call.
- The contact half of `CompanyContactPicker` becomes its own `ContactField` (see job 12), composed beside `CompanyField`.
- Note: `CompanyField` defaults `listId="company-options"` and `CompanySearchSelect` hard-codes `id="company-options"`; two on one page would collide.

Files to change: 7.

## 2. File upload and drop zones

**Canonical: none exists.** Best candidate to extract: the dashed label in `src/components/group-benefits/NewEb.tsx:144` (whole zone is a `<label>`, `sr-only` input so it stays keyboard-reachable, status text shows "Reading every tab…" / file name). Only one place supports drag and drop: `src/app/connect/[token]/upload/page.tsx:43-45`.

19 `<input type="file">` in 18 files:

| Shape | Locations |
| --- | --- |
| Dashed label zone | `NewEb.tsx:147`, `QuickQuote.tsx:162` (label `:158`), `NewQuoteWizard.tsx:259`, `claims/second-opinion/page.tsx:118`, `BulkImportContacts.tsx:170`, `letters/AppointmentLetterDialog.tsx:136` |
| Drag-and-drop zone (public HR page) | `app/connect/[token]/upload/page.tsx:49` |
| Hidden input + `Button`/`Btn` that clicks it | `debit-notes/new/page.tsx:132`, `debit-notes/historical/page.tsx:211`, `sales/contacts/page.tsx:169`, `sales/ImportLeadsDialog.tsx:43`, `policies/MembersPanel.tsx:128`, `documents/DataRoom.tsx:141`, `placement/PlacementPanel.tsx:153`, `placement/ReviewDraftsDrawer.tsx:499`, `engagement-agent/engagement-compose-panel.tsx:606`, `chat/floating-chat-composer.tsx:43`, `pricing-matrix/page.tsx:424` |
| Visible native file input | `policies/MembersPanel.tsx:405` |
| Image insert in editor | `RichEditor.tsx:449` |

Same file read, different screens: census upload (`.xlsx/.csv`) is built 5 times (`NewEb`, `QuickQuote`, `NewQuoteWizard`, `MembersPanel` x2, `connect/upload`); CSV contact/lead import 3 times (`sales/contacts`, `BulkImportContacts`, `ImportLeadsDialog`).

**Migration note.** A `FileDrop` primitive needs: `accept`, `multiple`, label text, busy text, current file name, drag-over state (from `connect/upload`), reset of `e.target.value` after pick (every caller does this by hand), and a `variant="button"` for the toolbar callers. Attachment pickers in composers (`engagement-compose-panel`, `ReviewDraftsDrawer`, `floating-chat-composer`) can use the button variant.

Files to change: 18.

## 3. Registers and tables

**Canonical: `Register`** (`src/components/ui/register.tsx:31`; 51 importers, 80 uses; `RegisterEmpty` in 31 files). Why: the signed-off dense grid, sticky header, sortable `RegisterTh`, frozen first column, selected row, group rows, empty row.

Second grid primitive: `XlGrid` (`src/components/ui/xl-grid.tsx:32`, 3 importers: `rfq/page.tsx`, `PoliciesRegister.tsx`, `placement/ComparisonGrid.tsx`). Excel-style banded grid with row numbers and fills. Keep only if the spreadsheet look is a deliberate second pattern; otherwise fold its `fill`, `XlBand` and `XlNum` into `Register` props.

Hand-rolled `<table>`: 39 tables in 20 files (excludes `MessageBlock.tsx:195`, which is a regex on email HTML).

| Tables | File:first line |
| --- | --- |
| 4 | `app/pricing-matrix/quote/[id]/analysis/page.tsx:98` |
| 3 | `components/sales/EnquiryDrawer.tsx:173` |
| 3 | `components/hr-connect/read-table.tsx:22` (public HR pages, 7 importers) |
| 3 | `app/pricing-matrix/[id]/page.tsx:421` |
| 3 | `app/nexus/cases/page.tsx:1592` |
| 3 | `app/analytics/earnings/page.tsx:231` |
| 3 | `app/analytics/autonomy/page.tsx:30` |
| 3 | `app/analytics/ai-usage/page.tsx:190` |
| 2 | `components/group-benefits/NewEb.tsx:163` |
| 2 | `app/claims/page.tsx:101` |
| 1 each | `settings/RenewalMethodPanel.tsx:64`, `settings/ClientFormsPanel.tsx:52`, `placement/CustomRatesDialog.tsx:117`, `group-benefits/ValueScore.tsx:212`, `group-benefits/QuickQuote.tsx:181`, `group-benefits/BenefitComparison.tsx:88`, `companies/CompanyTable.tsx:120`, `app/pricing-matrix/[id]/schedule/page.tsx:161`, `app/kyn-roi/page.tsx:107`, `app/connect/[token]/review/page.tsx:106` |

`CompanyTable.tsx` is the table `Register` was modelled on and still hand-rolls it. The analytics pages each define their own `num` cell class (`analytics/autonomy:26`, `earnings:45`, `ai-usage:66`).

**Migration note.** Comparison matrices (`BenefitComparison`, `ValueScore`, `analysis/page`, `pricing-matrix/[id]`) use row headers on the left and per-insurer columns; `Register` needs a row-header cell (`<th scope="row">`) and a column-group header to take them. Public HR pages (`hr-connect/read-table`) use their own CSS (`hrc-*`) and can stay as a separate public-surface table.

Files to change: 20 (18 if public HR pages stay).

## 4. Tabs and segmented controls

**Canonical: `Segmented`** (`primitives.tsx:101`, 49 importers, 75 uses). Why: the design rule says tabs and filters are the segmented control; radio semantics; counts built in. `ToggleGroup` does not exist in this repo (0 hits).

Other implementations:

| Location | What it is |
| --- | --- |
| `app/pricing-matrix/[id]/page.tsx:255` | Underlined tab row (`role="tablist"`), per-cover tabs with a sub-label and a count. |
| `app/nexus/cases/page.tsx:1062` | Underlined tab row "Case views" with counts. |
| `app/companies/[id]/page.tsx:254` | Ghost-button tab row (`role="tablist"`) plus a "← Back" button at `:240`. |
| `components/contacts/CompaniesTab.tsx:59` | Underlined Contacts / Companies switch. The same switch on `app/contacts/page.tsx:184` already uses `Segmented`, so one toggle renders two ways depending on which side you are on. |
| `components/policies/PoliciesRegister.tsx:162` | Inline `role="tablist"` of sections. |
| `app/contacts/page.tsx:273`, `app/inbound/email/page.tsx:178`, `components/sales/CampaignEditor.tsx:139,145` | `.filter-pill` CSS buttons (`aria-pressed`). |
| `app/inbound/email/page.tsx:159` | KPI-tile buttons acting as a filter (also a row of figure tiles, which the UI rules forbid). |
| `components/engagement/MessageBlock.tsx:401-402` | HTML / Text text toggle. |
| `components/insurers/DeclinesRegister.tsx:42` | `Chip` wrapped in a button as a filter toggle. |
| `components/nav/top-navbar.tsx:149` `PlaceTabs` (`.trs-subtab`) | Page navigation, not a filter. Keep. |
| `app/settings/page.tsx:73` | Side navigation. Keep. |

**Migration note.** `Segmented` needs: an optional sub-label per option (pricing-matrix cover tabs), an `href` mode for URL-driven tabs (`PolicyTabs` at `app/policies/[id]/controls.tsx:12` already wraps `Segmented` with `router.push`), and horizontal scroll when options overflow (pricing-matrix has one tab per cover). Filter pills that clear on second click (`DeclinesRegister`) need an `allowEmpty` option or stay as chips.

Files to change: 8 (excluding the 2 navigation rows).

## 5. Buttons

**Canonical: `Btn`** (`primitives.tsx:82`, 79 importers, 326 uses), with `LinkBtn` (9) and `btnClass` (1) for links. Why: the documented ladder (primary green, secondary outlined, tertiary, danger), two heights, `loading`.

| Implementation | Count |
| --- | --- |
| `Button` from `src/components/ui/button.tsx` (shadcn variants) | 20 importers, 71 uses; 12 of those files also import `Btn` |
| Raw `<button>` tags | 450 in 138 files |
| Raw `<button>` hand-filled as a primary (dark fill) | 36 in 26 files |
| `<a>` styled as a button by hand | 2 (`app/policies/[id]/controls.tsx:20,29`) |

Hand-filled primaries, by file: `nexus/cases/page.tsx` 4 (`:382, 1281, 3440, 3658`), `NewQuoteWizard.tsx` 3 (`:348, 493, 510`), `roadplus/page.tsx` 2, `settings/TeamTable.tsx` 2 (`:78, 85`), `chat/floating-chat-composer.tsx` 2, `ValueScore.tsx` 2 (`:131, 197`), `QuickQuote.tsx` 2 (`:127, 272`), and 1 each in `pricing-matrix/page.tsx:429`, `pricing-matrix/quote/[id]/page.tsx:242`, `pricing-matrix/[id]/page.tsx:243`, `pricing-matrix/[id]/schedule/page.tsx:131`, `companies/page.tsx:215`, `settings/VoicePanel.tsx:95`, `engagement-context-panel.tsx:290`, `compose-toolbar.tsx:60`, `chat-message-item.tsx:122`, `floating-chat-dock.tsx:53`, `chat-empty-state.tsx:37`, `chat-thread-list.tsx:39`, `floating-chat-header.tsx:63`, `TodoEditor.tsx:81`, `ThreadHeader.tsx:96`, `ThreadListPane.tsx:117`, `ThreadView.tsx:496`, `EbRegister.tsx:80` ("+ New quotation", `background: '#132c1c'`), `ReviewDraftsDrawer.tsx:352`.

Raw buttons that are text links, row targets or icon buttons are legitimate; the 36 filled ones and the 20 `ui/button` files are the duplicates.

**Migration note.** `ui/button` offers `variant="outline" | "ghost"` and `size="icon"`; `Btn` has no icon-only size. Add `size="icon"` (30 square) to `Btn`, map `outline` → `secondary`, `ghost` → `tertiary`, then delete `ui/button.tsx` (it is also imported by `data-table/toolbar.tsx`).

Files to change: 20 (`ui/button`) + 26 (filled raw) = 46, 4 overlap (`CompanyContactPicker`, debit-notes pages use `Button`; listed once each) → 44 distinct files.

## 6. Modals, dialogs and drawers

**Canonical: `Dialog` from `src/components/ui/dialog.tsx`** (24 importers, 30 uses). Why: Radix focus trap, Escape, portal, aria; most used. Its overlay is a flat `bg-[#0f1412]/40` with no blur.

| Implementation | Location | Importers |
| --- | --- | --- |
| `HrModal` ("the house modal": blurred backdrop, panel rises) | `src/components/group-benefits/hr/HrModal.tsx:13` | 4 (`InsurerEmailDialog`, `InsurerContactsDialog`, `hr/SendLinkDialog`, `pricing-matrix/hr-links/[id]`) |
| Radix used directly, own overlay | `engagement/NewEmailComposeModal.tsx:185` | 4 |
| Hand-rolled `fixed inset-0` modal | `app/pricing-matrix/page.tsx:415`, `group-benefits/ThreadSelectorModal.tsx:39`, `engagement/ThreadView.tsx:479`, `nexus/NexusPhasedAnalysisModal.tsx:184`, `app/nexus/cases/page.tsx:533` (`CreateCaseModal`), `:3624` (`ThreadLinkerModal`) | |
| `Sheet` (`ui/sheet.tsx`) | `ThreadView.tsx`, `top-navbar.tsx` | 2 |
| Hand-rolled right drawer (`fixed right-0`, own Escape handler) | `sales/EnquiryDrawer.tsx:69`, `sales/LeadDrawer.tsx:61`, `marketing/EntryDrawer.tsx:76`, `placement/ReviewDraftsDrawer.tsx:553` (+ its own backdrop `:571`) | 1 each |
| Hand-rolled side pane that becomes a full-screen overlay under 768px | `app/contacts/page.tsx:362`, `contacts/CompaniesTab.tsx:130` | |
| Hand-rolled popover (`role="dialog"`, absolute) | `app/companies/page.tsx:195` (filter panel); `ui/popover` has 2 importers | |

**Migration note.** Keep `ui/dialog` and give its overlay and content `HrModal`'s blurred backdrop and rise/fade (the house rule for every modal), then move `HrModal`'s 4 callers and delete it. Add a `size` prop (the design-system 3 sizes) since callers override `max-w-*` by hand. For drawers, keep `ui/sheet` and add what the hand-rolled drawers do: J/K or arrow stepping (`LeadDrawer`), expand-to-wide (`ReviewDraftsDrawer` `Maximize2`), no backdrop mode (sales drawers leave the list clickable).

Files to change: 15.

## 7. Page headers, breadcrumbs and back links

**Canonical: `PageHeader`** (`src/components/page-header.tsx:16`, 15 importers; h1 30px) and **`Breadcrumbs`** (`src/components/nav/Breadcrumbs.tsx`, 15 importers).

Page headers built another way:
- `MarketingPage` (`src/components/marketing/page-shell.tsx:13`, 11 importers; h1 36px, own `back` slot).
- `hr-connect/frame.tsx` (11 importers; public HR pages; keep separate).
- `CompanyHeader` (`crm/CompanyHeader.tsx:113`), `CampaignEditor.tsx:93`, `CompaniesTab.tsx:55`, `InsurersDirectory.tsx:67`, `FollowUpsLedger.tsx:99`, `ThreadHeader.tsx:86`.
- Raw `<h1>` in 34 app pages that import neither `PageHeader` nor `MarketingPage` (for example `pricing-matrix/page.tsx:143`, `pricing-matrix/[id]/page.tsx:209`, `nexus/cases/page.tsx:381`, `claims/page.tsx:75`, `analytics/*`, `sales/leads|contacts|enquiries|campaigns`, `debit-notes/new:123`, `debit-notes/historical:24`, `insurers/[id]:67`, `today/[id]:162`, `companies/triage:135`).
- h1 sizes in use: 36px x23, 30px x8, 22px x5, 28px x3, 24px x3, 26px x2, 19px x1, 15px x1.

Back links (forbidden; `Breadcrumbs` is the standard):

| Location | Text |
| --- | --- |
| `app/companies/[id]/page.tsx:191` | "← Contacts" (error state) |
| `app/companies/[id]/page.tsx:240-246` | "← Back" (returns to default tab) |
| `app/pricing-matrix/page.tsx:161` | "← Quotations" |
| `app/pricing-matrix/page.tsx:183` | back to the start of New quote |
| `app/nexus/cases/page.tsx:994` | "← Cases" (mobile) |
| `app/inbound/email/page.tsx:357-361` | "← Back to list" (mobile) |
| `app/marketing/articles/[id]/page.tsx:73` | "← Articles" via `MarketingPage back` |
| `app/marketing/generate/runs/[id]/page.tsx:82` | via `MarketingPage back` |
| `components/sales/CampaignEditor.tsx:89` | `ChevronLeft` "Campaigns" |
| `app/today/[id]/page.tsx:147` | "Back to Today" (error state) |
| `components/crm/CompanyMail.tsx:175` | `ArrowLeft` "All threads" (in-panel) |
| `components/crm/CaseThreadPicker.tsx:220` | `ArrowLeft` "Back to {company}'s emails" (in-dialog step) |
| `components/group-benefits/NewQuoteWizard.tsx:509` | wizard Back step |
| `components/placement/ReviewDraftsDrawer.tsx:397` | `ChevronLeft` "All drafts" (in-drawer) |
| `components/engagement/ThreadHeader.tsx:82` | mobile back to the list |

Unused imports of `ArrowLeft`: `app/debit-notes/new/page.tsx:7`, `app/debit-notes/historical/page.tsx:8`.

Detail pages with no `Breadcrumbs`: `sales/campaigns/[id]`, `marketing/articles/[id]`, `marketing/generate/runs/[id]` (plus `connect/[token]/*`, public). `companies/[id]` gets it through `CompanyHeader`.

**Migration note.** In-panel and wizard steps (CompanyMail, CaseThreadPicker, NewQuoteWizard, ReviewDraftsDrawer, mobile list/detail toggles) are state changes, not page navigation; they should stay but use one shared `StepBack` text button, not an arrow-link per file. Page-level ones (companies, pricing-matrix, marketing, campaigns, today error state) move to `Breadcrumbs`. `MarketingPage` should drop its `back` slot and render `Breadcrumbs`; then it becomes `PageHeader` + the site switch.

Files to change: 13 page-level + 34 raw-h1 pages (overlap 6) → 41 distinct files.

## 8. Money and date formatting

**Canonical: `src/lib/format.ts`** (`money`, `num`, `fmtDate`, `fmtDay`, `fmtDateTime`, `timeAgo`; 38 importers). Why: written to replace 31 copies of `money`; Singapore time regardless of server clock; a dash for null.

Second module with overlapping names: **`src/lib/crm/format.ts`** (33 importers). It re-exports `fmtDate`, but its own `fmtMoney` prints `SGD 1,234.00` where `money` prints `S$1,234.00` (5 importers), its `fmtDateTime` (3 importers) uses the runtime timezone, and `fmtRelative` (9 importers) duplicates `timeAgo` (7). The same figure renders two ways depending on the screen.

Other shared formatter modules: `hr-connect/format.ts` (`fmtDob`, `fmtLong`, `fmtStamp`; 5), `group-benefits/hr/labels.ts` (`fmtDateTime` 1, `fmtDob` 1), `lib/sales/labels.ts` (`fmtDate` 3, `fmtDay` 2), `assistant/shared.tsx` (`fmtDate` 4, `fmtWhen` 1), `engagement/helpers.ts` (`fmtDateTime` 1, `fmtWhen` 1), `policies/types.ts` (`fmtAmount` 3), `board/model.ts` (`fmtMoney` 1, `fmtShort` 0), `lib/intake/format.ts` (`fmtWhen` 2), `lib/activity-labels.ts` (`relTime` 2), `inbound/helpers.ts:25` (`fmtDate`, 0 importers).

Local formatters in UI files:

| File:line | Local |
| --- | --- |
| `app/pricing-matrix/quote/[id]/page.tsx:32` | `money` (Intl currency) |
| `app/pricing-matrix/quote/[id]/plans/page.tsx:27` | `money` |
| `app/pricing-matrix/page.tsx:311` | `fmtDay`; `:376` Intl currency inline |
| `app/pricing-matrix/[id]/page.tsx:567` | `fmt` (`$n`) |
| `app/rfq/page.tsx:25` | `sgd` |
| `app/debit-notes/page.tsx:33` | `fmt` (ccy + amount) |
| `app/debit-notes/new/page.tsx:189` | `fmtDay` |
| `app/insurers/[id]/page.tsx:23` | `fmt` (date) |
| `app/marketing/schedule/page.tsx:25` | `shortDate` |
| `app/marketing/competitors/page.tsx:24` | `fmtWhen` |
| `app/roadplus/page.tsx:135-139` | `fmtDate`, `fmtDay`, `fmtMoney` |
| `app/analytics/earnings/page.tsx:26,29` | `money` (`S$`, rounded), `dateLabel` |
| `app/analytics/ai-usage/page.tsx:45` | `sgd` |
| `app/claims/page.tsx:40` | `money` |
| `app/claims/second-opinion/page.tsx:33` | `ago` (actually a date-time) |
| `components/chat/chat-thread-list.tsx:8` | `timeAgo` |
| `components/home/Board.tsx:24` | `longDate` |
| `components/today/ComingUp.tsx:31` | `money` |
| `components/companies/CompanyTable.tsx:62` | `money` |
| `components/group-benefits/BenefitComparison.tsx:23` | `money` (Intl currency) |
| `components/group-benefits/NewQuoteWizard.tsx:23` | `money` (Intl currency) |
| `components/group-benefits/ValueScore.tsx:27` | `money` |
| `components/group-benefits/QuickQuote.tsx:45` | `fmtDob` |
| `components/placement/ComparisonGrid.tsx:22` | `sgd` |
| `components/placement/CustomRatesDialog.tsx:36` | `sgd` |
| `app/nexus/cases/page.tsx:1692` | `fmtBytes` |

`pct` is redefined in 7 UI files (`policies/[id]/page.tsx:19`, `roadplus:30`, `analytics/autonomy:20`, `analytics/earnings:30`, `RenewalMethodPanel.tsx:14`, `CompanyRenewals.tsx:16`, `RenewalCalendar.tsx:17`); `format.ts` has no `pct`.

Raw locale calls in UI code (`src/app` + `src/components`, API routes excluded): 111 `toLocaleString` / `toLocaleDateString` / `toLocaleTimeString` calls in 62 files; top: `nexus/cases/page.tsx` 8, `analytics/ai-usage` 7, `kyn-roi` 6, `calendar` 6. `Intl.*Format` in UI: `group-benefits/hr/labels.ts` 4, `marketing/schedule` 2, `SendLinkDialog`, `marketing/newsletter`, `marketing/generate/runs/[id]`, `marketing/competitors` 1 each.

Server and PDF code (`src/lib/**`) has its own copies (`debit-note-pdf.tsx:134-135`, `policies/ledger/report-model.ts:34-38`, `policies/ledger/advice.ts:20-21`, `gb/report-model.ts:141,146`, `gb/client-draft.ts:48`, `gb/scenario-run.ts:195,202`, `gb/intake.ts:400`, `gb/analysis.ts:101`, `nexus/sources.ts:32`, `placement/compare.ts:68`, `placement/lines.ts:43`, `hr/email.ts:31`, `letters/undertaking.ts:31`, `agents/renewal/review.ts:25`). Several are deliberate (email copy rounds to whole dollars); they belong in `format.ts` as named variants, not as local lambdas.

**Migration note.** `format.ts` needs: `pct(r)`, `money(n, { dp: 0 })` already exists for the rounded `S$` form, a `longDate` ("13 November 2026") for letters and reports, `fmtDob` (dd/mm/yyyy), `fmtBytes`, and `fmtRelative`'s future wording ("in 12 days", "tomorrow"), which `timeAgo` lacks. Decide one currency style (`S$` vs `SGD`) before collapsing `crm/format.fmtMoney`.

Files to change: 2 modules + 10 helper modules + 26 local-formatter files + remaining raw-locale files (62 files total with raw calls, overlapping) → about 70 distinct files.

## 9. Empty, loading and error states

**Canonical: `Empty`** (30 importers) and **`Spinner`** (43) in `primitives.tsx`; `RegisterEmpty` (31) inside registers.

Other implementations:
- Local `Empty` in `src/components/home/HomeCanvas.tsx:128` (same name, different component).
- `XlEmpty` (`ui/xl-grid.tsx:119`), `ChatEmptyState` (`chat/chat-empty-state.tsx:14`), `EaWorkspaceEmptyState` (`engagement/EaLayout.tsx:192`), `NoThreadsState` and `NoDataState` (`app/nexus/cases/page.tsx:1247, 1372`).
- `<Loader2 …animate-spin>` inline: 60 uses in 25 files outside `primitives.tsx`.
- "Loading…" text inline: 63 lines in 54 files not going through `Spinner`.
- `animate-pulse` skeletons: 19 files.
- Error text: no shared component. `Alert` (`ui/Alert.tsx:84`) has 1 importer. Error lines are coloured by hand in 57 files: `#a1242f` x61, `text-trs-neg` x21, `text-destructive` x9.

**Migration note.** Add an `ErrorLine` (or `Empty tone="error"`) primitive and an inline `Spinner size="inline"` (no padding, for buttons and rows), then sweep. Empty states with an action (`NoThreadsState` has "Link threads") need an `action` slot on `Empty`. Decide whether skeletons are a pattern; if yes, one `Skeleton` primitive.

Files to change: about 60 (Loader2/Loading files overlap heavily; exact figure after the sweep).

## 10. Chips and status pills

**Canonical: `Chip`** (`primitives.tsx:23`, 54 importers, 145 uses). Why: the website `.s-pill` tones on tokens; most used.

| Implementation | Location | Importers |
| --- | --- | --- |
| `StatusBadge` (own colour map, 33 hex lines) | `src/components/status-badge.tsx:73` | 3 |
| `EngagementStatusBadge` (wraps `StatusBadge`) | `engagement-agent/engagement-status-badge.tsx:10` | 0 (dead) |
| `EmailTypeBadge` | `engagement-agent/email-type-badge.tsx:15` | 1 |
| `ChannelBadge` | `inbound/channel-badge.tsx:11` | 2 |
| `Tag` + `TONE` map (own hex tones) | `companies/CompanyTable.tsx:32` | used in-file only |
| `PartyChip`, `WhiteChip`, `CitationChip` | `app/nexus/cases/page.tsx:219, 228, 1388` | in-file |
| `TypeBadge` | `SignaturePanel.tsx:51` | in-file |
| `PersonTag` (person avatar pill) | `board/TodoEditor.tsx:34` | 6 |
| `RecipientChip`, `AttachmentChip` | `engagement-agent/compose-toolbar.tsx:184, 237` | 3 |
| `GroupPill` (rail group titles) | `engagement/rail-bits.tsx:23` | in-file |
| `StageBadge` | `primitives.tsx:33` | 0 (dead) |
| Hand-rolled pill spans (rounded + bg + 10-12px text) | `nexus/cases` 2, `compose-toolbar` 2, `calendar`, `CaseEditor`, `engagement-message-card`, `MessageBlock`, `RecipientAutocomplete`, `top-navbar` | 10 in 8 files (lower bound; regex on class strings) |

Thin wrappers that are fine and should stay: `marketing/chips.tsx` (8 importers) and `sales/chips.tsx` (4) map a status to a label and render `Chip`.

**Migration note.** `StatusBadge`, `EmailTypeBadge`, `ChannelBadge`, `CompanyTable Tag` and the nexus chips each carry a status → label map; keep the maps, render `Chip` with a tone. `Chip` needs `onClick` (CompanyTable `Tag` and `DeclinesRegister` use clickable chips) and a no-dot variant for citation/count chips. `PersonTag`, `RecipientChip` and `AttachmentChip` are a different job (removable token) and should become one `Token` component.

Files to change: 9.

## 11. Email thread pickers

**Canonical: `CaseThreadPicker`** (`src/components/crm/CaseThreadPicker.tsx:56`, 1 importer: `CompanyNexus`). Why: built on `ui/dialog`, multi-select with checkboxes, starts on the client's own mail, second page searches the whole inbox (`/api/companies/threads/search?q=`), summary and category per row.

| Implementation | Location | Importers | Source |
| --- | --- | --- | --- |
| `ThreadSelectorModal` | `group-benefits/ThreadSelectorModal.tsx:10` | 1 (`pricing-matrix/quote/[id]/page.tsx`) | `/api/leads`, single pick, hand-rolled overlay |
| `ThreadLinkerModal` | `app/nexus/cases/page.tsx:3457` | in-file | `/api/nexus/cases/:id/suggest` (+ `?all=1`), multi-select, party type and label per thread, unlink |
| `AddToCaseControl` | `engagement/AddToCaseControl.tsx` | | the reverse direction (thread → case); different job |

**Migration note.** `CaseThreadPicker` needs a `single` mode (`ThreadSelectorModal` picks one thread to reply into), a pluggable source (suggestions endpoint for Nexus), and an optional per-row extra (party type select in `ThreadLinkerModal`).

Files to change: 2.

## 12. Person, contact, recipient and insurer pickers

### Recipients (email addresses)

**Canonical: `useAutocomplete` + `SuggestionList`** (`src/components/engagement/RecipientAutocomplete.tsx:128, 88`; 2 importers: `NewEmailComposeModal`, `engagement-compose-panel`). Searches `/api/contacts/search`.

Others: `<datalist id="nexus-known-emails">` (`app/nexus/cases/page.tsx:2208`); plain comma-separated input in `ReviewDraftsDrawer.tsx:447`; plain input in `NexusComposeWindow` (`nexus/cases/page.tsx:3370`); contact half of `CompanyContactPicker` (company-scoped emails, with add).

### Insurer contacts

`ContactPicker` (`placement/ContactPicker.tsx:20`, 3 importers) is the only multi-select of insurer contacts. `InsurerContactsDialog` and `InsurerEmailDialog` each have their own "add email" field (`:99`, `:190`). Keep `ContactPicker`; share the add-email row.

### Insurers

**Canonical: `InsurerOptions`** (`src/components/insurers/InsurerOptions.tsx:12`, 2 importers: debit-notes new/historical). Reads the one insurer list (`/api/insurers`).

Others: hard-coded `INSURERS` arrays in `group-benefits/NewEb.tsx:24` (select at `:192`, 5 names) and `placement/CustomRatesDialog.tsx:21` (datalist at `:135`, different list and order); `<select>` of insurers in `app/pricing-matrix/[id]/page.tsx:311` and `insurers/InsurersDirectory.tsx:202`; filter select in `analytics/earnings/page.tsx:160` (a filter; can stay). The two hard-coded lists drift from the insurer register.

### Staff (owner, assignee)

**Canonical: `OwnerPicker`** (`companies/OwnerPicker.tsx:12`, 1 importer) for many owners, rendered with `PersonTag`; the design system says a choice of person is a "Reassign" button with a menu (`DropdownMenu`, used at `today/[id]/page.tsx:203`, `work/page.tsx:183`, `home/HomeCanvas.tsx:164`).

Native `<select>` of staff instead: `crm/CompanyHeader.tsx:242`, `assistant/CaseEditor.tsx:93`, `board/TodoEditor.tsx:137`, `engagement/ThreadView.tsx:488`.

### Sender ("From") select

Five copies: `engagement/NewEmailComposeModal.tsx:286`, `engagement-agent/engagement-compose-panel.tsx:460`, `inbound/inline-reply-row.tsx:261`, `placement/ReviewDraftsDrawer.tsx:414`, `app/nexus/cases/page.tsx:3194`. Each formats the option differently (label, `label <email>`, email only).

**Migration note.** One `RecipientField` (chips + `useAutocomplete`) and one `SenderSelect`; insurer inputs all read `InsurerOptions`; staff choice is a `ReassignMenu` built from the three existing dropdown copies.

Files to change: recipients 4, insurers 4, staff 4, sender 5 → 15 distinct (overlap in composer files).

## 13. Email composer (found during the sweep)

Five implementations of "write and send an email":

| Implementation | Location | Lines | Importers |
| --- | --- | --- | --- |
| `NewEmailComposeModal` | `components/engagement/NewEmailComposeModal.tsx` | 353 | 4 |
| `engagement-compose-panel` | `components/engagement-agent/engagement-compose-panel.tsx` | 730 | 2 |
| `ReviewDraftsDrawer` | `components/placement/ReviewDraftsDrawer.tsx` | 591 | 1 |
| `inline-reply-row` | `components/inbound/inline-reply-row.tsx` | 351 | 1 |
| `NexusComposeWindow` (+ `NexusStepCompose`) | `app/nexus/cases/page.tsx:3089-3457` | about 370 | in-file |

Shared parts already exist in `engagement-agent/compose-toolbar.tsx` (`TbGroup`, `FieldRow`, `RecipientChip`, `QuietSelect`, `AttachmentChip`; 4 importers). `/api/email/send` is called from three of them (`nexus/cases/page.tsx`, `engagement-compose-panel.tsx`, `NewEmailComposeModal.tsx`).

**Canonical candidate: `engagement-compose-panel`** (most complete: attachments, sender, autocomplete, drafts). The send route must not change (standing rule); consolidation is in the preparing step and UI only.

Files to change: 5.

## 14. Form fields and inputs (found during the sweep)

**Canonical: `Field` + `inputCls` / `textareaCls`** (`primitives.tsx:126, 136-137`; 27 and 46 importers).

Duplicates: `Field` in `src/components/ui/field.tsx:4` (3 importers: debit-notes new/historical, `CompanyContactPicker`); `Input` in `ui/input.tsx` (3: `contacts/page`, `DebitNoteEmailTemplatePanel`, `SignaturePanel`); local `inputCls` in `today/[id]/page.tsx:48`, `debit-notes/page.tsx:356`, `roadplus/page.tsx:207`, `home/TodoList.tsx:37`; `INPUT` in `engagement-context-panel.tsx:24`; `cell` input classes in `InsurersDirectory.tsx:18`, `ProductEditor.tsx:10`; `selectCls` defined twice (`placement/shared.tsx:11`, `assistant/CaseEditor.tsx:18`) plus a third in `inbound/inline-reply-row.tsx:161`.

Search boxes: `DataTableSearch` (`data-table/toolbar.tsx:36`, 7 importers) and `UrlFilters` (`ui/url-filters.tsx:9`, 2) versus hand-rolled search inputs with a `Search` icon in `nexus/cases:399`, `rfq:80`, `inbound/email:189`, `finance:118`, `roadplus:403`, `companies:122`, `ThreadListPane:135`, `InsurersDirectory:74`.

Files to change: 6 (field/input) + 9 (local classes) + 8 (search) = 23.

## 15. Related finding: near-duplicate pages

`app/debit-notes/new/page.tsx` (671 lines) and `app/debit-notes/historical/page.tsx` (615 lines) differ on 346 lines; about 470 lines are identical. Same upload block, same `CompanyContactPicker`, same `InsurerOptions` field, both with an unused `ArrowLeft` import.

---

## Summary

| Job | Canonical | Duplicate implementations | Files to change |
| --- | --- | --- | --- |
| 1. Company picker | `CompanyField` | 6 | 7 |
| 2. File upload / drop zone | none; extract from `NewEb` | 19 inputs, 3 shapes | 18 |
| 3. Registers / tables | `Register` | `XlGrid` + 39 raw tables | 20 |
| 4. Tabs / segmented | `Segmented` | 9 hand-rolled rows (+2 nav, keep) | 8 |
| 5. Buttons | `Btn` / `LinkBtn` | `ui/button` (20 files) + 36 filled raw buttons + 2 link-buttons | 44 |
| 6. Modals / drawers | `ui/dialog` (+ `ui/sheet`) | `HrModal`, direct Radix, 6 hand modals, 4 hand drawers, 2 side panes, 1 popover | 15 |
| 7. Page headers / back links | `PageHeader` + `Breadcrumbs` | `MarketingPage`, 6 component headers, 34 raw-h1 pages, 15 back links | 41 |
| 8. Money / date formatting | `lib/format.ts` | `lib/crm/format.ts`, 10 helper modules, 26 local formatters, 111 raw locale calls | about 70 |
| 9. Empty / loading / error | `Empty`, `Spinner`, `RegisterEmpty` | 6 empty variants, 60 inline `Loader2`, 63 inline "Loading…", 0 shared error line | about 60 |
| 10. Chips / pills | `Chip` | 9 badge components + 10 hand pills | 9 |
| 11. Thread pickers | `CaseThreadPicker` | 2 | 2 |
| 12. Person / recipient / insurer / staff / sender pickers | `useAutocomplete`, `InsurerOptions`, `OwnerPicker` + Reassign menu | recipients 4, insurers 4, staff 4, sender 5 | 15 |
| 13. Email composer | `engagement-compose-panel` | 4 | 5 |
| 14. Form fields, inputs, search | `Field` + `inputCls`; `DataTableSearch` | 2 `ui/*` + 9 local classes + 8 search boxes | 23 |

## Hard-coded colours in component code

1,912 hex literals in 172 `.tsx` files. 256 local colour constants (`const MUTED = '#4a5550'` and similar) in 95 files; most duplicate a `--trs-*` token in `globals.css`. `FAINT` is defined as `#6f7a74` (`--trs-subtle`) in 17 files and `#8c958f` (no token) in 3, so "faint" text is two greys.

Most used:

| Hex | Uses | Token it duplicates |
| --- | --- | --- |
| `#0f1412` | 346 | `--trs-ink` |
| `#f1f2ee` | 218 | `--trs-field` |
| `#4a5550` | 215 | `--trs-muted` |
| `#e6e8e4` | 197 | `--trs-line` |
| `#2a332f` | 185 | `--trs-ink-2` |
| `#8c958f` | 121 | none (no token) |
| `#d5d9d4` | 113 | `--trs-line-2` |
| `#faf9f6` | 112 | `--trs-tint` |
| `#6f7a74` | 67 | `--trs-subtle` |
| `#a1242f` | 61 | `--trs-neg` |
| `#132c1c` | 55 | `--trs-green` |

Top 20 files by hex occurrences:

| Hex literals | File |
| --- | --- |
| 66 | `src/components/status-badge.tsx` |
| 62 | `src/app/pricing-matrix/[id]/page.tsx` |
| 54 | `src/components/group-benefits/ValueScore.tsx` |
| 49 | `src/components/group-benefits/NewQuoteWizard.tsx` |
| 49 | `src/app/nexus/cases/page.tsx` |
| 44 | `src/components/engagement-agent/compose-toolbar.tsx` |
| 43 | `src/components/group-benefits/QuickQuote.tsx` |
| 40 | `src/components/group-benefits/BenefitComparison.tsx` |
| 38 | `src/app/pricing-matrix/page.tsx` |
| 38 | `src/app/pricing-matrix/[id]/schedule/page.tsx` |
| 38 | `src/app/debit-notes/new/page.tsx` |
| 38 | `src/app/debit-notes/historical/page.tsx` |
| 33 | `src/app/pricing-matrix/quote/[id]/page.tsx` |
| 30 | `src/app/roadplus/page.tsx` |
| 29 | `src/components/engagement-agent/engagement-context-panel.tsx` |
| 28 | `src/components/companies/CompanyTable.tsx` |
| 28 | `src/components/RichEditor.tsx` |
| 28 | `src/app/debit-notes/page.tsx` |
| 27 | `src/app/claims/second-opinion/page.tsx` |
| 26 | `src/components/engagement-agent/engagement-compose-panel.tsx` |

Reproduce: `grep -roE "#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b" src --include='*.tsx' | grep -v __tests__ | cut -d: -f1 | sort | uniq -c | sort -rn | head -20`.

## Suggested order

1. Formatting (job 8): pure functions, testable, no visual risk; collapses two money styles into one.
2. Buttons and colours (jobs 5 + tokens): mechanical, removes most of the hex literals.
3. Modals and drawers (job 6): one house modal; fixes the blur rule everywhere at once.
4. Company picker and thread pickers (jobs 1, 11): small file counts, high user-facing consistency.
5. Composer (job 13): largest and riskiest; do after 1-4 so it lands on settled primitives.
