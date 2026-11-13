# TRS dashboard — brief for Claude

Read this before touching anything in this folder. The workspace rules in `../../CLAUDE.md` still apply (one folder = one repo = one deployable; push to `main` deploys; `gcloud --account developer@trade-risksol.com` per command).

## 1. What TRS is

Trade Risk Solutions Pte Ltd, a Singapore insurance broker. Lines: employee benefits (EB: group hospital & surgical, GP, specialist, dental, term life, critical illness, personal accident), foreign-worker medical, WICA, liability, property, marine, bonds, motor, professional indemnity, D&O, cyber. Owner of the engagement: Jarod Hong (Kyn). TRS staff who use the dashboard: Nathan Budiutomo (broking, EB), Cheng Sou "Ernest" Tan, Hasya, Angela; operations@trade-risksol.com is the shared mailbox. Catherine Lim has left; her threads remain.

## 2. The product

The dashboard replaces inbox-and-spreadsheet broking with one system: every email filed to a company, every policy and debit note on a register, agents that read, price and draft, people who approve and send. Nothing sends without a click.

| Item | Value |
| --- | --- |
| Code | this folder (`dashboard/` of the public `website` repo, org `traderisksolutions`) |
| Working branch | `build/integrate`; releases are also pushed to `rfq-golive-2026-10-29` and `main` with the same sha |
| Live | https://trs-dashboard-pi.vercel.app (Vercel project `trs-dashboard`); `/login` answers 200 when healthy |
| Stack | Next.js 15.5, React 19, Tailwind, PostgREST over Cloud SQL (`src/lib/crm/db.ts`: `sb`, `sbTry`, `enc`), Gemini for reads |
| Env | `.env.local`: `SUPABASE_SERVICE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `AUTH_SECRET`, `GEMINI_API_KEY_*`, `GMAIL_REFRESH_TOKEN` (prod only) |
| Checks | `npm run check` = `tsc --noEmit` + `next lint --dir src` + `vitest run` (about 1,700 tests). `npm run knip` lists unused files, exports and dependencies. `.github/workflows/dashboard-check.yml` runs the same three on every push that touches `dashboard/`. Lint errors fail `next build`, so a red lint is a failed deploy. `npm run journeys` walks the user journeys in Chrome against a local production build (`tests/journeys/`); run it before every deploy, and add a journey for every behaviour a client asks for (`docs/behaviours.md`). |

### Modules, in the order staff use them

- **Inbox** (`/engagement`): threads from three mailboxes (Cheng, Nathan, operations@). A thread filed under an insurer or partner is about a client: `thread_insurers.client_company_id`, named by `src/lib/crm/client-link.ts` (subject rules, then a model read; nightly in the admin sweep). Visibility: a thread is shared when operations@ holds it or no mailbox owns it; else the owner, operations@ and anyone at TRS on the email see it (`src/lib/mail/visibility.ts`). The context rail (`ContextRail.tsx`, `ChiefBar.tsx`) opens with From (Client, Insurer or Referral, set by a person: `ThreadParty.tsx`), then three groups: Actions (who the thread waits on, suggestions with a Yes, drafts, to-do, case), AI (Read thread, Summary, Draft reply), Information (company, policy, renewal, outstanding, contact, threads).
- **Client 360** (`docs/client-360.md`): every business's repository is its group's ledger, facts and numbers. Clients › Portfolio ranks businesses by commission with their admin beside it (`src/lib/clients/portfolio.ts`); Knowledge › Numbers shows one business. Only TRS's own records and conversations; no paid data.
- **Today** (`/today`): the work queue by section (send, decide, act, read, later); the morning and afternoon digest emails come from it.
- **Companies** (`/companies/[id]`): the record page; policies, quotes, finance, threads, Nexus analysis.
- **Quotes → EB** (`/pricing-matrix`): the register of quotations (`EbRegister.tsx`); + New EB = one census in, one analysis out (`NewEb.tsx` → `POST /api/group-benefits/analysis` → `/pricing-matrix/quote/<id>/analysis`). The package ladder (`src/lib/gb/packages.ts`, five packages as numbers resolved per insurer), the analysis run (`src/lib/gb/analysis.ts`: every package at every insurer in one run, Custom by numbers via `custom.ts` + `limit-facts.ts`, Split by category, saved as `gb_analysis:<id>`) and `analysisAsScenarios` (what the client report and draft read) sit on the same engine as the plan builder. Routes in: the EB register, the thread rail (EB analysis), the company EB tab, Today › Coming up › EB renewals. Rate cards per insurer (`gb_rate_tables`, `gb_rates`), plan ladder (`src/lib/gb/ladder.ts`), pricing engine (`src/lib/gb-quote.ts`), builder (`src/lib/gb/builder.ts`), intake agent (`src/lib/gb/intake.ts`), EB pricing estimate (`src/lib/gb/scenario-run.ts`, `scenarios.ts`, `brief.ts`), client email (`src/lib/gb/client-draft.ts`), client report PDF (`report-model.ts`, `report-pdf.tsx`). Method and proofs: `docs/gb-pricing-method.md`.
- **Placements** (`docs/placement.md`): requests to insurers per line, quotes read from replies, binding.
- **Claims, Policies, Finance (debit notes), Documents, Marketing**: registers and agents per `docs/`.

### Agents

**AI is manual (Jarod, 13 Nov 2026): every model call is started by a person's button.** `src/lib/ai-gate.ts` refuses any call without a signed-in TRS session behind the request: crons, the agent queue, mail ingest, webhooks and scripts reach no model and spend nothing. Code that calls a model directly takes its key from `modelKey()` / `anthropicKeyGated()`, never `agentKey()` or `process.env.ANTHROPIC_API_KEY`. Background readers skip without claiming or recording (Nexus reader, client linker, the credit guard holds the reading agents). Held agent work runs only from Today › AI approvals (`/work/ai`), a Run button per agent. `AI_MODE=auto` would restore automatic runs; it is not set. Do not run model calls from scripts.

Every model call goes through `callGemini` (`src/lib/ai-call.ts`) with an `agent` and a `feature` registered in `src/lib/gemini-usage.ts` and `src/lib/ai-agents.ts`; spend is attributed per agent key. Models: `GEMINI_FLASH` for drafting, `GEMINI_DEEP` for reading. Rules that do not bend: a model reads, code computes. No premium, date, age or count comes from a model. A model's structured read is always passed through a pure `normalise*` function that bounds and parses it. A rewrite of a client email is kept only when every figure survives (`keepsFigures`).

## 3. Standing constraints (Jarod's)

- Never handle or ask for `CRON_SECRET`; Jarod runs the scheduler scripts himself.
- Never commit the uncommitted change to `src/lib/ai-call.ts` (the local AI bridge). Never `git reset --hard` in this worktree; move HEAD with `git checkout -B build/integrate <sha>` or a merge.
- Never modify `/api/email/send`; fix sends in the preparing step or the caller.
- No client names in the public repo's commits or docs beyond what the code already carries.
- Approval and sending happen only in the dashboard; no test send without Jarod's go.
- Never paste keys; never change the global gcloud account.
- Deploy only on Jarod's go ("ok deploy"). Then: clean-worktree build, push the same sha to the three branches, wait for the Vercel status, check `/login`.

## 4. How to work here

**Before changing code**: read `docs/refactor-plan.md` (the phases, what is done, what is next) and the module's doc in `docs/`, reuse the primitives (`src/components/crm/primitives.tsx`: `Btn`, `Chip`, `Segmented`, `Field`), format money, dates and ages with `src/lib/format.ts` (never a local `money`/`fmtDate`/`timeAgo`), reuse `rail-bits.tsx` for the rail and `Breadcrumbs` (`src/components/nav/Breadcrumbs.tsx`) on every detail page: `current` is the page's own name, `fallback` its owner (the company for a policy or quotation). The trail (`src/lib/nav/trail.ts`) follows links into new tabs through the URL hash; never a "← Back to X" link of your own.

**UI rules** (`docs/design-system.md` and Jarod's standing feedback): white ground, hairlines only inside tables, no tinted panels, no boxes around tiles, no rules between sections, no row of KPI tiles, no explanatory sentences under figures, tabs and filters are the segmented control, one primary button per view, group titles on the rail are green pills, headers name the thing, numbers over adjectives. Copy is courteous and plain where a client reads it.

**Dogfood recipe**: `API_GATE_MODE=log-only npx next dev -p 3117` (the dev server crashes under many concurrent compiles; for page sweeps build a clean worktree and `npx next start -p 3118`). Mint a session: `createSession({ id, email, name }, AUTH_SECRET)` from `src/lib/auth/session.ts` with tsx, then call APIs with `Cookie: trs_session=…` or set `document.cookie` in Chrome. Scripts go in `scripts/_x.mts`, run with `set -a; source .env.local; set +a; npx tsx --tsconfig tsconfig.json scripts/_x.mts`, and are deleted after. Test records use `.invalid` domains and are removed.

**Integrity sweeps** (run after any data-touching change): live policies past end date (hourly roll exists), duplicate threads (same Gmail id aliased elsewhere, or the same RFC 822 message in two threads), duplicate companies by normalised name, quotations with an employee under 16, `error_logs` grouped by feature for the last 7 days.

**Deploy routine** (journeys green first):
```
git worktree add --detach <scratch>/clean <sha>; ln -s <node_modules> …; cp .env.local …; npx next build
git push origin "<sha>:main" "<sha>:rfq-golive-2026-10-29" "<sha>:build/integrate"
gh api repos/traderisksolutions/website/commits/<sha>/statuses   # wait for trs-dashboard success
curl -s -o /dev/null -w "%{http_code}" https://trs-dashboard-pi.vercel.app/login
```
Quote `"${sha}:branch"`; zsh mangles `$sha:branch`. If `main` moved under you, merge `origin/main` and push the merge to all three.

**Reporting**: lead with what is live and what was verified; separate facts from assumptions; if a step was skipped, say so; show the figures in a table, not in prose.

## 5. The Employment Benefits flow, end to end (the one Jarod tests most)

1. **Routes in:** Quotes › Employment Benefits › + New quotation (`/pricing-matrix/new`); the company page's Employment Benefits tab; a thread's rail item "Employment benefits analysis" › Open census; Today › Coming up › renewals due. Each opens New quotation with what it knows filled.
2. **Documents** (`NewEb.tsx`): company (shared `CompanyField`), Census box (upload or a file from the company's emails, every tab read, password asked when protected), Last year's policy and premium box (schedule, endorsements, debit note), Brochures (five house products, Drive links).
3. **Reading:** the census by code (`census-parse.ts`); last year's policy by one deep-model call bounded by `last-year.ts`.
4. **Review:** tabs to price, last year's policy (editable premiums, sum check, endorsement changes, conflicts), details, current cover as numbers filled from last year's plans. Confirm runs `POST /api/group-benefits/analysis`.
5. **Report** (`/pricing-matrix/quote/<id>/analysis`): Anchor (last year beside the same cover this year), the current cover at every insurer, one change at a time (`runCurrent`, `current.ts`), client report and Draft to client. No model prices anything.

Compare cover (`/pricing-matrix/quote/<id>/compare`, `CompareCover.tsx`, `src/lib/gb/compare-cover.ts`): Today is last year's policy (read on New quotation, files kept in Drive and linked), hospital chosen by ward then limit, Hospital options lists every hospital plan with its riders, plan rules from Employment Benefits › Plan rules (`src/lib/gb/plan-pairs.ts`, read from the brochures) applied on every change. The client report is Compare cover as a PDF (`compare-report.ts`): Download, Send on WhatsApp (signed 30-day link to the kept copy, `/api/public/gb-report`), Send by email (draft with the PDF). The older quotation and report pages redirect to Compare cover. Census and policy is one screen for every way in: New quotation, an existing quotation (`/quote/<id>/edit`, Confirm reprices in place) and an HR link (`/new?hrLink=<id>`).

Target screens (prototype of 13 Nov, built on Nathan's Gembridge workbook): Compare in Nathan's layout (plan selection per insurer per cover, premium per cover, benefit schedule rows from the brochures), cover steps with cover-per-premium and a running total, tiers one plan down and up per insurer, Options A to D, census workbook export with prices. Not built yet.

## 6. Where to look

- `docs/gb-pricing-method.md`: pricing proofs (Gembridge to the cent), the estimate rules, the client draft.
- `docs/design-system.md`: tokens, borders, chips, the rail.
- `docs/agent-routing.md`, `docs/placement.md`, `docs/ontology.md`: agents, placements, data model.
- `docs/refactor-plan.md`: baseline numbers (11 Nov 2026), the phases, the rules for each.
- `docs/routes.md`: where every record links to and where Back goes.
- `docs/changelog.md`: what shipped when.
