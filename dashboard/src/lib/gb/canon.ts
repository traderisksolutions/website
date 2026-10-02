/**
 * Group Benefits — the canonical vocabulary.
 *
 * This lives in code rather than only in the database because it is small, it changes rarely,
 * and every change to it should be reviewable. The database holds a synced copy so that SQL
 * can join on it; `gb_product_canon` and `gb_benefit_canon` are written from here, never edited
 * directly. What does live only in the database is gb_label_alias — one row per insurer label
 * per year, written when a human approves that year's scan, which grows and cannot be shipped.
 *
 * The thing that was missing. gb_rates already holds 612 real premiums, so arithmetic was never
 * the gap. What no table recorded was that AIA's "GHS+EMM", Income's "Group Hospital and
 * Surgical (GHS)" and QBE's "Group Hospital & Surgical (GHS)" are the same cover — or that
 * "GHS Coverage", "Hospital", "Other" and "Group basic Hospital & Surgical benefits" are four
 * spellings of one schedule. Premiums could be totalled; nothing could be compared. Comparison
 * is the job: what the client gives up to save the money.
 */

export type ProductKind = 'core' | 'rider'

/**
 * How two insurers' values for a benefit line may be set against each other.
 *
 * This is the load-bearing decision in the whole module. "$300,000" against "$60,000" is
 * arithmetic. "1 Bed" against "4 Bed" is an ordered comparison with a known direction. A
 * geographical-scope clause or a pre-existing-conditions clause is neither, and ordering it
 * would assert a judgement the data does not support — so `text` lines are shown side by side
 * and never ranked.
 */
export type CompareAs =
  | 'sgd_limit'        // an annual or per-event dollar cap — higher is more cover
  | 'sgd_per_visit'
  | 'sgd_per_day'
  | 'room_tier'        // ward class, ordered by ROOM_TIER_RANK below
  | 'percent'          // co-payment or co-insurance — LOWER is more cover; see PERCENT_LOWER_IS_BETTER
  | 'salary_multiple'
  | 'as_charged'       // uncapped within the policy limit — beats any finite cap on the same line
  | 'days'
  | 'text'             // never ordered
  | 'boolean'

export type CanonProduct = {
  code: string
  name: string
  abbrev: string
  kind: ProductKind
  sortOrder: number
  notes?: string
}

export type CanonBenefit = {
  code: string
  productCode: string
  name: string
  compareAs: CompareAs
  unit?: string
  /** Shown in the compact comparison. The rest sit behind "all lines". */
  headline?: boolean
  sortOrder: number
  notes?: string
}

/** The cover types a Singapore group-benefits broker actually quotes. */
export const PRODUCTS: CanonProduct[] = [
  { code: 'GHS',    name: 'Group Hospital & Surgical',                 abbrev: 'GHS',    kind: 'core',  sortOrder: 10 },
  { code: 'EMM',    name: 'Extended Major Medical',                    abbrev: 'EMM',    kind: 'rider', sortOrder: 20,
    notes: 'Sits above the GHS annual limit. Frequently sold bundled with GHS as one premium.' },
  { code: 'GHS_FW', name: 'Group Hospital & Surgical — Foreign Worker', abbrev: 'GHS-FW', kind: 'core', sortOrder: 30,
    notes: 'The MOM-mandated work-permit and S-Pass cover. Priced and underwritten separately from GHS.' },
  { code: 'GTL',    name: 'Group Term Life',                           abbrev: 'GTL',    kind: 'core',  sortOrder: 40 },
  { code: 'GCI',    name: 'Group Critical Illness',                    abbrev: 'GCI',    kind: 'rider', sortOrder: 50,
    notes: 'Accelerated in most schedules — a claim reduces the GTL sum assured rather than adding to it.' },
  { code: 'GPA',    name: 'Group Personal Accident',                   abbrev: 'GPA',    kind: 'core',  sortOrder: 60 },
  { code: 'GADD',   name: 'Group Accidental Death & Dismemberment',    abbrev: 'GADD',   kind: 'core',  sortOrder: 70 },
  { code: 'GOPC',   name: 'Group Outpatient Primary Care',             abbrev: 'GP',     kind: 'rider', sortOrder: 80 },
  { code: 'GOSC',   name: 'Group Outpatient Specialist Care',          abbrev: 'SP',     kind: 'rider', sortOrder: 90 },
  { code: 'GD',     name: 'Group Dental',                              abbrev: 'GD',     kind: 'rider', sortOrder: 100 },
]

/**
 * The schedule lines within each cover.
 *
 * Sourced from the lines that actually recur across the AIA, Income and QBE schedules rather
 * than from an ideal taxonomy — a canonical line nobody prints is a column of blanks. A line an
 * insurer does not offer is absent for that insurer, which is itself a finding worth showing.
 */
export const BENEFITS: CanonBenefit[] = [
  // ── Group Hospital & Surgical ───────────────────────────────────────────────
  { code: 'GHS_HOSPITAL_TYPE',  productCode: 'GHS', name: 'Hospital type',                        compareAs: 'text',      headline: true, sortOrder: 10 },
  { code: 'GHS_ROOM_BOARD',     productCode: 'GHS', name: 'Room & board',                         compareAs: 'room_tier', headline: true, sortOrder: 20 },
  { code: 'GHS_ANNUAL_LIMIT',   productCode: 'GHS', name: 'Annual policy limit',                  compareAs: 'sgd_limit', headline: true, sortOrder: 30, unit: 'SGD' },
  { code: 'GHS_CO_PAYMENT',     productCode: 'GHS', name: 'Co-payment',                           compareAs: 'percent',   headline: true, sortOrder: 40, unit: '%' },
  { code: 'GHS_ICU',            productCode: 'GHS', name: 'Intensive care unit',                  compareAs: 'sgd_limit', sortOrder: 50, unit: 'SGD' },
  { code: 'GHS_HOSP_MISC',      productCode: 'GHS', name: 'Hospital miscellaneous services',      compareAs: 'sgd_limit', sortOrder: 60, unit: 'SGD' },
  { code: 'GHS_SURGICAL',       productCode: 'GHS', name: 'Surgical benefit',                     compareAs: 'sgd_limit', sortOrder: 70, unit: 'SGD' },
  { code: 'GHS_INHOSP_DOCTOR',  productCode: 'GHS', name: "In-hospital doctor's visit",           compareAs: 'sgd_limit', sortOrder: 80, unit: 'SGD' },
  { code: 'GHS_PRE_HOSP',       productCode: 'GHS', name: 'Pre-hospitalisation consultation',     compareAs: 'sgd_limit', sortOrder: 90, unit: 'SGD' },
  { code: 'GHS_POST_HOSP',      productCode: 'GHS', name: 'Post-hospitalisation treatment',       compareAs: 'sgd_limit', sortOrder: 100, unit: 'SGD' },
  { code: 'GHS_DAY_SURGERY',    productCode: 'GHS', name: 'Day surgery',                          compareAs: 'sgd_limit', sortOrder: 110, unit: 'SGD' },
  { code: 'GHS_EMERG_ACC_OP',   productCode: 'GHS', name: 'Emergency accidental outpatient',      compareAs: 'sgd_limit', sortOrder: 120, unit: 'SGD' },
  { code: 'GHS_EMERG_DENTAL',   productCode: 'GHS', name: 'Emergency accidental dental',          compareAs: 'sgd_limit', sortOrder: 130, unit: 'SGD' },
  { code: 'GHS_OP_KIDNEY',      productCode: 'GHS', name: 'Outpatient kidney dialysis',           compareAs: 'sgd_limit', sortOrder: 140, unit: 'SGD' },
  { code: 'GHS_OP_CANCER',      productCode: 'GHS', name: 'Outpatient cancer treatment',          compareAs: 'sgd_limit', sortOrder: 150, unit: 'SGD' },
  { code: 'GHS_IMPLANTS',       productCode: 'GHS', name: 'Surgical implants',                    compareAs: 'sgd_limit', sortOrder: 160, unit: 'SGD' },
  { code: 'GHS_PSYCH',          productCode: 'GHS', name: 'Inpatient psychiatric treatment',      compareAs: 'sgd_limit', sortOrder: 170, unit: 'SGD' },
  { code: 'GHS_HOME_NURSING',   productCode: 'GHS', name: 'Home nursing care',                    compareAs: 'sgd_limit', sortOrder: 180, unit: 'SGD' },
  { code: 'GHS_REHAB',          productCode: 'GHS', name: 'Rehabilitation',                       compareAs: 'sgd_limit', sortOrder: 190, unit: 'SGD' },
  { code: 'GHS_MISCARRIAGE',    productCode: 'GHS', name: 'Miscarriage',                          compareAs: 'sgd_limit', sortOrder: 200, unit: 'SGD' },
  { code: 'GHS_MATERNITY',      productCode: 'GHS', name: 'Maternity',                            compareAs: 'sgd_limit', sortOrder: 210, unit: 'SGD' },
  { code: 'GHS_DEATH',          productCode: 'GHS', name: 'Death benefit',                        compareAs: 'sgd_limit', sortOrder: 220, unit: 'SGD' },
  // Added 2 Oct 2026 from the first canonical scan of QBE's Steadfast MCare+ brochure: eight
  // lines it prints that the canon had no slot for. This is the loop working — an unmatched line
  // is reported rather than dropped, and the canon grows by what insurers actually print.
  { code: 'GHS_AMBULANCE',      productCode: 'GHS', name: 'Ambulance charges',                   compareAs: 'sgd_limit', sortOrder: 112, unit: 'SGD' },
  { code: 'GHS_SHORT_STAY',     productCode: 'GHS', name: 'Short stay ward',                     compareAs: 'sgd_limit', sortOrder: 114, unit: 'SGD' },
  { code: 'GHS_PARENT_ACCOM',   productCode: 'GHS', name: 'Parent accommodation',                compareAs: 'sgd_limit', sortOrder: 116, unit: 'SGD' },
  { code: 'GHS_MEDICAL_REPORT', productCode: 'GHS', name: 'Medical report fees',                 compareAs: 'sgd_limit', sortOrder: 118, unit: 'SGD' },
  { code: 'GHS_CONFINEMENT_CASH', productCode: 'GHS', name: 'Daily cash on confinement',         compareAs: 'sgd_per_day', sortOrder: 192, unit: 'SGD/day' },
  { code: 'GHS_CASH_DOWNGRADE', productCode: 'GHS', name: 'Hospital cash downgrade',             compareAs: 'sgd_per_day', sortOrder: 194, unit: 'SGD/day',
    notes: 'Paid when the member uses a lower ward class than entitled. Only some insurers offer it.' },
  { code: 'GHS_DREAD_DISEASE',  productCode: 'GHS', name: 'Dread disease recuperation',          compareAs: 'sgd_limit', sortOrder: 196, unit: 'SGD' },
  { code: 'GHS_EMERG_ASSIST',   productCode: 'GHS', name: 'Emergency assistance',                compareAs: 'text',      sortOrder: 232 },
  // Second round, from scanning Income's FlexCare and AIA's Flexi Vital Care brochures.
  { code: 'GHS_PER_DISABILITY', productCode: 'GHS', name: 'Maximum limit per disability',        compareAs: 'sgd_limit', sortOrder: 32, unit: 'SGD',
    notes: 'A per-condition cap alongside the annual limit. A high annual limit with a low per-disability cap is not the cover it looks like.' },
  { code: 'GHS_OVERSEAS',       productCode: 'GHS', name: 'Overseas hospitalisation',            compareAs: 'sgd_limit', sortOrder: 198, unit: 'SGD' },
  { code: 'GHS_REPATRIATION',   productCode: 'GHS', name: 'Repatriation of mortal remains',      compareAs: 'sgd_limit', sortOrder: 199, unit: 'SGD' },
  { code: 'GHS_GEO_SCOPE',      productCode: 'GHS', name: 'Geographical coverage',                compareAs: 'text',      sortOrder: 230 },
  { code: 'GHS_PRE_EXISTING',   productCode: 'GHS', name: 'Pre-existing conditions',              compareAs: 'text',      headline: true, sortOrder: 240 },
  { code: 'GHS_PANEL',          productCode: 'GHS', name: 'Panel requirement',                    compareAs: 'text',      sortOrder: 250 },

  // ── Extended Major Medical ──────────────────────────────────────────────────
  { code: 'EMM_ANNUAL_LIMIT',   productCode: 'EMM', name: 'Annual limit',                         compareAs: 'sgd_limit', headline: true, sortOrder: 10, unit: 'SGD' },
  { code: 'EMM_CO_INSURANCE',   productCode: 'EMM', name: 'Co-insurance',                         compareAs: 'percent',   headline: true, sortOrder: 20, unit: '%' },
  { code: 'EMM_PER_DISABILITY', productCode: 'EMM', name: 'Maximum limit per disability',        compareAs: 'sgd_limit', headline: true, sortOrder: 15, unit: 'SGD' },
  { code: 'EMM_DEDUCTIBLE',     productCode: 'EMM', name: 'Deductible',                           compareAs: 'sgd_limit', sortOrder: 30, unit: 'SGD',
    notes: 'Lower is more cover here, unlike every other sgd_limit line. Flagged in the comparison rather than ordered.' },

  // ── Group Hospital & Surgical, foreign worker ───────────────────────────────
  { code: 'GHSFW_ANNUAL_LIMIT', productCode: 'GHS_FW', name: 'Annual policy limit',               compareAs: 'sgd_limit', headline: true, sortOrder: 10, unit: 'SGD' },
  { code: 'GHSFW_ROOM_BOARD',   productCode: 'GHS_FW', name: 'Room & board',                      compareAs: 'room_tier', headline: true, sortOrder: 20 },
  { code: 'GHSFW_CO_PAYMENT',   productCode: 'GHS_FW', name: 'Co-payment',                        compareAs: 'percent',   sortOrder: 30, unit: '%' },
  { code: 'GHSFW_MOM_COMPLIANT',productCode: 'GHS_FW', name: 'Meets MOM minimum',                 compareAs: 'boolean',   headline: true, sortOrder: 40 },

  // ── Group Term Life ─────────────────────────────────────────────────────────
  { code: 'GTL_SUM_ASSURED',    productCode: 'GTL', name: 'Sum assured',                          compareAs: 'sgd_limit', headline: true, sortOrder: 10, unit: 'SGD' },
  { code: 'GTL_DEATH',          productCode: 'GTL', name: 'Death',                                compareAs: 'text',      headline: true, sortOrder: 20 },
  { code: 'GTL_TPD',            productCode: 'GTL', name: 'Total & permanent disability',         compareAs: 'text',      headline: true, sortOrder: 30 },
  { code: 'GTL_TERMINAL',       productCode: 'GTL', name: 'Terminal illness',                     compareAs: 'text',      sortOrder: 40 },
  { code: 'GTL_COMPASSIONATE',  productCode: 'GTL', name: 'Compassionate allowance',              compareAs: 'sgd_limit', sortOrder: 50, unit: 'SGD' },
  { code: 'GTL_FREE_COVER',     productCode: 'GTL', name: 'Free cover limit',                     compareAs: 'sgd_limit', headline: true, sortOrder: 60, unit: 'SGD',
    notes: 'The sum assured granted without medical underwriting. The line that decides whether a census is quotable as it stands.' },

  // ── Group Critical Illness ──────────────────────────────────────────────────
  { code: 'GCI_SUM_ASSURED',    productCode: 'GCI', name: 'Sum assured',                          compareAs: 'sgd_limit', headline: true, sortOrder: 10, unit: 'SGD' },
  { code: 'GCI_CONDITIONS',     productCode: 'GCI', name: 'Conditions covered',                   compareAs: 'days',      headline: true, sortOrder: 20, unit: 'conditions',
    notes: 'A plain count, compared as a number. 37 is the common Singapore schedule.' },
  { code: 'GCI_ACCELERATED',    productCode: 'GCI', name: 'Accelerated or additional',             compareAs: 'text',      headline: true, sortOrder: 30 },
  { code: 'GCI_ANGIOPLASTY',    productCode: 'GCI', name: 'Angioplasty advance',                  compareAs: 'text',      sortOrder: 40 },
  { code: 'GCI_SURVIVAL',       productCode: 'GCI', name: 'Survival period',                      compareAs: 'days',      sortOrder: 50, unit: 'days' },

  // ── Group Personal Accident ─────────────────────────────────────────────────
  { code: 'GPA_AD',             productCode: 'GPA', name: 'Accidental death',                     compareAs: 'sgd_limit', headline: true, sortOrder: 10, unit: 'SGD' },
  { code: 'GPA_PTD',            productCode: 'GPA', name: 'Permanent total disablement',          compareAs: 'sgd_limit', headline: true, sortOrder: 20, unit: 'SGD' },
  { code: 'GPA_PPD',            productCode: 'GPA', name: 'Permanent partial disablement',        compareAs: 'text',      sortOrder: 30 },
  { code: 'GPA_MEDICAL_EXP',    productCode: 'GPA', name: 'Accidental medical expenses',          compareAs: 'sgd_limit', sortOrder: 40, unit: 'SGD' },
  { code: 'GPA_WEEKLY_INCOME',  productCode: 'GPA', name: 'Temporary disablement income',         compareAs: 'sgd_limit', sortOrder: 50, unit: 'SGD/week' },
  { code: 'GPA_COMMON_CARRIER',productCode: 'GPA', name: 'Accidental death by common carrier',  compareAs: 'sgd_limit', sortOrder: 15, unit: 'SGD' },
  { code: 'GPA_SCOPE',          productCode: 'GPA', name: 'Cover scope',                          compareAs: 'text',      headline: true, sortOrder: 60,
    notes: '24-hour worldwide against occupational-only. The difference clients notice at claim time.' },

  // ── Group Accidental Death & Dismemberment ──────────────────────────────────
  { code: 'GADD_AD',            productCode: 'GADD', name: 'Accidental death',                    compareAs: 'sgd_limit', headline: true, sortOrder: 10, unit: 'SGD' },
  { code: 'GADD_DISMEMBER',     productCode: 'GADD', name: 'Dismemberment scale',                 compareAs: 'text',      headline: true, sortOrder: 20 },
  { code: 'GADD_MAJOR_BURNS',   productCode: 'GADD', name: 'Major burns',                         compareAs: 'text',      sortOrder: 30 },
  { code: 'GADD_COMA',          productCode: 'GADD', name: 'Comatose state',                     compareAs: 'sgd_limit', sortOrder: 25, unit: 'SGD' },
  { code: 'GADD_MOBILITY_AID',  productCode: 'GADD', name: 'Mobility aid',                       compareAs: 'sgd_limit', sortOrder: 35, unit: 'SGD' },
  { code: 'GADD_EDUCATION',     productCode: 'GADD', name: "Children's education fund",           compareAs: 'sgd_limit', sortOrder: 40, unit: 'SGD' },

  // ── Group Outpatient Primary Care ───────────────────────────────────────────
  { code: 'GOPC_PANEL_VISIT',   productCode: 'GOPC', name: 'Panel GP visit',                      compareAs: 'sgd_per_visit', headline: true, sortOrder: 10, unit: 'SGD' },
  { code: 'GOPC_NONPANEL',      productCode: 'GOPC', name: 'Non-panel GP visit',                  compareAs: 'sgd_per_visit', headline: true, sortOrder: 20, unit: 'SGD' },
  { code: 'GOPC_CO_PAYMENT',    productCode: 'GOPC', name: 'Co-payment per visit',                compareAs: 'percent',   headline: true, sortOrder: 30, unit: '%' },
  { code: 'GOPC_VISIT_LIMIT',   productCode: 'GOPC', name: 'Visits per year',                     compareAs: 'days',      sortOrder: 40, unit: 'visits' },
  { code: 'GOPC_POLYCLINIC',    productCode: 'GOPC', name: 'Polyclinic visit',                   compareAs: 'sgd_per_visit', sortOrder: 22, unit: 'SGD' },
  { code: 'GOPC_TELEMEDICINE',  productCode: 'GOPC', name: 'Telemedicine',                       compareAs: 'sgd_per_visit', sortOrder: 24, unit: 'SGD' },
  { code: 'GOPC_TCM',           productCode: 'GOPC', name: 'Traditional Chinese medicine',        compareAs: 'sgd_per_visit', sortOrder: 26, unit: 'SGD' },
  { code: 'GOPC_XRAY_LAB',      productCode: 'GOPC', name: 'X-ray & laboratory tests',            compareAs: 'sgd_limit', sortOrder: 28, unit: 'SGD' },
  { code: 'GOPC_AE_VISIT',      productCode: 'GOPC', name: 'Accident & emergency visit',          compareAs: 'sgd_per_visit', sortOrder: 29, unit: 'SGD' },
  { code: 'GOPC_ANNUAL_LIMIT',  productCode: 'GOPC', name: 'Annual limit',                        compareAs: 'sgd_limit', sortOrder: 50, unit: 'SGD' },

  // ── Group Outpatient Specialist Care ────────────────────────────────────────
  { code: 'GOSC_SPEC_VISIT',    productCode: 'GOSC', name: 'Specialist consultation',             compareAs: 'sgd_per_visit', headline: true, sortOrder: 10, unit: 'SGD' },
  { code: 'GOSC_DIAGNOSTIC',    productCode: 'GOSC', name: 'Diagnostic & laboratory',             compareAs: 'sgd_limit', sortOrder: 20, unit: 'SGD' },
  { code: 'GOSC_REFERRAL',      productCode: 'GOSC', name: 'Referral required',                   compareAs: 'boolean',   headline: true, sortOrder: 30 },
  { code: 'GOSC_NONPANEL',      productCode: 'GOSC', name: 'Non-panel specialist consultation',  compareAs: 'sgd_per_visit', sortOrder: 15, unit: 'SGD' },
  { code: 'GOSC_PHYSIO',        productCode: 'GOSC', name: 'Physiotherapy & chiropractic',        compareAs: 'sgd_limit', sortOrder: 25, unit: 'SGD' },
  { code: 'GOSC_PSYCH',         productCode: 'GOSC', name: 'Outpatient psychiatric treatment',    compareAs: 'sgd_limit', sortOrder: 27, unit: 'SGD' },
  { code: 'GOSC_CO_PAYMENT',    productCode: 'GOSC', name: 'Co-payment',                          compareAs: 'percent',   headline: true, sortOrder: 35, unit: '%' },
  { code: 'GOSC_ANNUAL_LIMIT',  productCode: 'GOSC', name: 'Annual limit',                        compareAs: 'sgd_limit', headline: true, sortOrder: 40, unit: 'SGD' },

  // ── Group Dental ────────────────────────────────────────────────────────────
  { code: 'GD_ANNUAL_LIMIT',    productCode: 'GD', name: 'Annual limit',                          compareAs: 'sgd_limit', headline: true, sortOrder: 10, unit: 'SGD' },
  { code: 'GD_PANEL',           productCode: 'GD', name: 'Panel requirement',                     compareAs: 'text',      sortOrder: 20 },
  { code: 'GD_CO_PAYMENT',      productCode: 'GD', name: 'Co-payment',                            compareAs: 'percent',   headline: true, sortOrder: 30, unit: '%' },
  { code: 'GD_SCALING',         productCode: 'GD', name: 'Scaling & polishing',                   compareAs: 'text',      sortOrder: 40 },
]

export const PRODUCT_BY_CODE: Record<string, CanonProduct> =
  Object.fromEntries(PRODUCTS.map(p => [p.code, p]))
export const BENEFIT_BY_CODE: Record<string, CanonBenefit> =
  Object.fromEntries(BENEFITS.map(b => [b.code, b]))

export const benefitsFor = (productCode: string): CanonBenefit[] =>
  BENEFITS.filter(b => b.productCode === productCode).sort((a, b) => a.sortOrder - b.sortOrder)

/**
 * Ward classes, best first. Used to order `room_tier` values.
 *
 * Rank is about privacy and access, which is what a client is buying: a single bed in a private
 * hospital outranks a single bed in a restructured one, and both outrank a four-bed ward. The
 * hospital type is a separate canonical line, so this rank covers only the bed class; a plan at
 * a restructured hospital is not penalised here, it simply reads differently on GHS_HOSPITAL_TYPE.
 */
export const ROOM_TIER_RANK: { pattern: RegExp; rank: number; label: string }[] = [
  { pattern: /\b(suite|deluxe)\b/i,                              rank: 1, label: 'Suite' },
  { pattern: /\b(1|one|single)[\s-]*(bed|bedded)?\b/i,           rank: 2, label: '1 bed' },
  { pattern: /\b(2|two)[\s-]*(bed|bedded)\b/i,                   rank: 3, label: '2 bed' },
  { pattern: /\bclass\s*a\b/i,                                   rank: 2, label: 'Class A' },
  { pattern: /\bclass\s*b1\b/i,                                  rank: 3, label: 'Class B1' },
  { pattern: /\b(4|four)[\s-]*(bed|bedded)\b/i,                  rank: 4, label: '4 bed' },
  { pattern: /\bclass\s*b2\b/i,                                  rank: 5, label: 'Class B2' },
  { pattern: /\b(6|six)[\s-]*(bed|bedded)\b/i,                   rank: 5, label: '6 bed' },
  { pattern: /\bclass\s*c\b/i,                                   rank: 6, label: 'Class C' },
  { pattern: /\bward\b/i,                                        rank: 5, label: 'Ward' },
]

/** Lower rank = more cover. Null when the text matches no known ward class. */
export function roomTierRank(value: string | null | undefined): number | null {
  if (!value) return null
  for (const t of ROOM_TIER_RANK) if (t.pattern.test(value)) return t.rank
  return null
}

/**
 * Lines where a smaller number means more cover, so the comparison must not call the larger
 * value better. Co-payments and co-insurance are the obvious cases; an EMM deductible is the
 * one that catches people out, because it is denominated in dollars like a limit but works
 * in the opposite direction.
 */
export const LOWER_IS_MORE_COVER = new Set<string>([
  'GHS_CO_PAYMENT', 'GHSFW_CO_PAYMENT', 'GOPC_CO_PAYMENT', 'GOSC_CO_PAYMENT', 'GD_CO_PAYMENT',
  'EMM_CO_INSURANCE', 'EMM_DEDUCTIBLE', 'GCI_SURVIVAL',
  // A Yes here is a restriction: the member must see a GP first.
  'GOSC_REFERRAL',
])
