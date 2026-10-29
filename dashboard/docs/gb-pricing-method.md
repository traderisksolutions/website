# Group benefits pricing method

How a premium is derived for any company, verified against the Gembridge quotation of 15 Oct 2026 (TRS EB Package Calculator - Gembridge.xlsx, 15 lives, five insurers, 28 figures reproduced to the cent by the engine on 19 Oct 2026). The regression test `src/__tests__/gb-gembridge-reproduction.test.ts` pins this method; a change that moves a cent fails the build.

## Inputs

1. Census: name, relationship (self / spouse / child), date of birth, category, occupation class (employees; 1 to 3).
2. Effective date and basis (new business / renewal).
3. One plan per cover per category. Gembridge used two sets: employees take every cover plus personal accident; dependants take the medical covers and no accident plan.
4. The insurer rate tables (`gb_rate_tables`, `gb_rates`) with their approved rules (`gb_rate_tables.rules`).

## Derivation, per life, per cover, per insurer

| Step | Rule | Where |
| --- | --- | --- |
| Age | Whole years at the effective date. RCC: age next birthday. Income, QBE Steadfast, Singlife, AIA: age last birthday. | `ageAt` in `src/lib/gb-quote.ts`; `gb_rate_tables.age_basis` |
| Rate row | Match insurer, product, plan, age band, member type, occupation class (`dimensions.occupation_class`, accident only). | `findRate` |
| Dependants | AIA has its own dependant rows (`member_type = dependant`). Income, QBE, Singlife, RCC price a dependant at the employee rate for their age. Assumption to confirm with Income and Steadfast. | rate rows |
| Basis | Rows flagged `renewal_only` price nothing on new business (RCC 71 to 75, Income 70 to 75, Steadfast 76 to 85, Singlife 71 to 75, AIA 70 to 74). | `inRenewalBand` |
| GST | Income and AIA rate cards are GST-inclusive and are netted by 1.09 to a cents figure. QBE, Singlife, RCC rate cards are net. Life and critical illness are GST-exempt supplies; health and accident are standard-rated at 9 percent. | `netOfGst`, `gstApplies`, `rules.gst_treatment` |
| Group size | RCC only: by number of employees (dependants do not count), medical lines only: 1 employee ×1.5, 2 to 4 ×1.0, 5 to 9 ×0.95, 10 or more ×0.90. No factor at the other four. | `rules.group_size_discount` with `tiers` and `exclude_products`; `groupFactor`, `employeeCount` |
| Employee-only lines | Steadfast personal accident and EAP; every accident line when the category map gives dependants no accident plan. | category map |
| Rounding | Rate card figure to cents, group factor applied unrounded (line at four decimals), subtotal rounded once, GST on the taxable subtotal, total rounded once. | `computeQuote` |

## Worked proof: Gembridge, effective 24 Oct 2026, new business

6 employees, 4 spouses, 5 children. Private 1-bed hospital, no co-pay; GP; specialist; dental; accident S$200k to 300k for employees at class 1.

| Insurer | Hospital | GP | Specialist | Dental | Accident | Total net |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Income FlexCare | 17,497.90 | 4,320.00 | 3,060.00 | 2,910.00 | 762.00 | 28,549.90 |
| Singlife MyBenefits Plus | 14,709.00 | not quoted | 7,758.00 | 4,695.00 | 540.00 | 27,702.00 |
| RCC Enhanced III | 21,491.82 | 5,339.43 | 5,561.63 | 4,853.41 | 553.32 | 37,799.61 |
| AIA Flexi Vital Care Plus | 21,979.65 | in specialist | 9,872.28 | 6,261.15 | 755.58 | 38,868.66 |
| QBE Steadfast MCare+ | 26,748.35 | 7,023.00 | 6,686.00 | 5,581.50 | 186.00 | 46,224.85 |

Plan codes used, by table: RCC `Plan 1 (PTE 1-bed)`, `Plan 1 (no co-pay)`, `Plan 1`, `Plan 1`, `Plan 2 ($250k)`; Income `Plan 1` for all, `Plan 2` accident; QBE `Plan 1 · Private 1-bedded`, `Plan 1`, `Plan 2`, `Plan 1 · Panel`, `Plan 2`; Singlife `Plan 6 (Pte 1-bed)`, specialist `Plan 6`, dental `Plan 3`, `Plan 4 ($200k)`; AIA `GHS+EMM PLAN 4`, `GP COPAY S$0 + SP PLAN 4`, `DENTAL PLAN 1`, `GADD PLAN 5`.

## What the weights do, and do not do

Weights never change a premium. A premium follows from the census, the plan picked and the insurer's rate card. Weights do two things:

1. Choose the tier per cover when the engine picks plans by rule: a high weight on a section asks for the tier that meets the requirement (ward, co-pay, limit); a low weight takes the entry tier.
2. Rank offers that meet the brief: section value = benefit per premium dollar, best insurer 100; score = sum of weight × value. An offer that fails a gate (ward below the brief, co-pay where none was asked, a cover not quoted, ICU capped where the brief says as charged) is shown but not ranked.

The weight set and the gates used are stored on the quotation (`gb_quotations.priorities`, `score.settings`) so every run on a company's record shows what it was ranked on.

## Adding an insurer or a plan year

1. Load the rate card: calculator (`scripts/gb-calculators/build.py` then `load.py --apply`) or workbook rows (`v12_load.py`). Occupation class goes in `dimensions.occupation_class`; dependant rows get `member_type`.
2. Write the rules: `age_basis`, `gst_treatment`, `renewal_only_bands`, `group_size_discount` (tiers by employees, `exclude_products`), `eligibility`. Approve the table.
3. Add the plans to `gb_plans` with ward, hospital type, co-payment, and benefit lines to `gb_benefits` with canonical codes.
4. Run the reproduction tests. If the insurer has a worked example from a real quotation, add it as a fixture next to Gembridge.

## 30 Oct 2026 — requirement → plan, audited rates, Gembridge by hand

**Formula.** Annual premium = Σ lives Σ covers rate(insurer, cover, plan, age band, member type, occupation class) × group factor (RCC, medical covers only) × days ÷ 365; plus 9% GST on medical and accident covers. Term life and critical illness are GST-exempt. Income and AIA publish GST-inclusive rates; the engine nets them at ÷ 1.09, rounded to cents.

**Ages.** RCC prices on age next birthday; Income, QBE, Singlife, AIA on age last birthday, at the policy start date.

**Gembridge, one line worked through.** Life 1 (employee, born 24 Dec 1971), start 24 Oct 2026: age last birthday 54, next birthday 55. RCC hospital Plan 1 (private 1-bed), band 51–55, S$2,302.14; 6 employees → group factor ×0.95 → S$2,187.03. The same life's RCC accident cover (Plan 2, S$250k, class 1) is S$92.22, no group factor. The spouse (also 55 next birthday) pays the same hospital rate; dependants take no accident cover. Summing every line for the 15 lives gives the workbook's five totals to the cent: RCC 37,799.61 · Income 28,549.90 · QBE 46,224.85 · Singlife 27,702.00 · AIA 38,868.66 (net of GST).

**Corrections found.** AIA dental covers children from age 3 (brochure p17): the workbook priced the 1-year-old, so AIA is S$453.71 lower (38,414.95). The 4 Aug comparison sheet labels AIA's accident plan "$50k"; the premium it shows (S$755.58 = 6 × S$125.93) is the S$250k plan.

**Audit.** All 1,549 V1.2 rates equal the insurers' brochures and calculators (RCC Sep 2025, Income Feb 2026, QBE 20 May 2026, Singlife Jun 2022, AIA May 2025). Every live gb_rates price equals V1.2 at every age 0–85 (35,088 points), after removing QBE plans the brochure says are not sold (Plan 5 government 1-bed; co-insurance on government plans) and marking AIA renewal-only bands (70+, CI 65+).

**Requirement → plan** (src/lib/gb/ladder.ts). One requirement per employee category picks a plan at every insurer; nearest plan flagged; the broker can change any cell. Rules held there: riders need hospital cover (Income, RCC) and RCC specialist needs GP; AIA and Singlife price GP inside their specialist rider; Income critical illness takes the term-life plan number; AIA critical illness is GTL + GACI on the same plan; foreign workers take Income Plan 7 / AIA GHS-FW; dependants take medical covers only.

**Underwriting** (src/lib/gb/underwriting.ts). Health declaration: RCC term life > S$150k, CI > S$75k, age ≥ 66 with life cover; Income > S$150k / > S$100k, age ≥ 65 with life cover; AIA > S$180k / > S$90k, age ≥ 64; QBE age ≥ 70; Singlife term life > S$150k. Group: Income, QBE, Singlife, AIA need 2 employees; AIA package to 50 lives; RCC loads one employee by 50%.

**Tiers.** Tier A (Income, AIA, RCC, QBE, Singlife) is priced for every request. Tier B (Cigna 1.0 priced when included; Cigna 2.0 and April on request) and Tier C (every other insurer with an employee-benefits product) only when the broker selects them on the plan builder; the request goes through the client's Employment Benefits placement line.
