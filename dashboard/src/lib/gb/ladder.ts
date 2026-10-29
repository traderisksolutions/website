/**
 * Employment Benefits: one requirement, one plan at every insurer.
 *
 * A broker states what a category of employees should have (private 1-bed hospital, top plan; GP
 * with no co-pay; specialist entry; S$250k accident cover) and this picks the plan at each insurer
 * that meets it. The scale is TRS's own; each insurer's plans are placed on it here, from the
 * insurer's brochure, by plan code exactly as the rate table stores it. Where an insurer has no
 * exact match the nearest plan is taken and the line says so; where it does not sell the cover at
 * all the line says that instead. Nothing here prices: the result is a category map for
 * computeQuote (src/lib/gb-quote.ts), so the numbers come from the same engine as before.
 *
 * Rules carried here because they decide WHICH plan, not what it costs:
 *   - Dependants take medical covers only (hospital, major medical, GP, specialist, dental);
 *     accident, term life and critical illness are employees only.
 *   - Work Permit and S Pass holders take the insurer's foreign-worker hospital plan where one
 *     exists (Income Plans 6–7, AIA GHS-FW); elsewhere the standard plan, flagged.
 *   - Riders follow their base: GP, specialist and dental need hospital cover (Income, RCC);
 *     specialist needs GP at RCC; critical illness needs term life and takes its plan number
 *     (Income, AIA).
 *
 * Pure. No I/O.
 */
import { resolveProduct } from './resolve'

export type Ward = 'G4' | 'G1' | 'P4' | 'P2' | 'P1'
export type Level = 'entry' | 'top'
export type Requirement = {
  ward: Ward | null
  wardLevel: Level
  /** Major medical on top of hospital cover, where the insurer sells it separately. */
  gmm: boolean
  gp: 'nil' | 'copay' | null
  sp: Level | null
  dental: Level | null
  /** Sums assured in S$; 0 or null = not covered. */
  pa: number | null
  gtl: number | null
  gci: number | null
  /** Dependants: medical covers, or not covered. */
  deps: 'medical' | 'none'
}

export const DEFAULT_REQUIREMENT: Requirement = { ward: 'P1', wardLevel: 'entry', gmm: false, gp: 'nil', sp: 'entry', dental: null, pa: null, gtl: null, gci: null, deps: 'medical' }

export type InsurerKey = 'rcc' | 'income' | 'qbe' | 'singlife' | 'aia' | 'cigna'
export const TIER_A: InsurerKey[] = ['income', 'aia', 'rcc', 'qbe', 'singlife']

/** Which scheme a rate table belongs to, from its insurer name. */
export function insurerKey(name: string | null | undefined): InsurerKey | null {
  const s = String(name ?? '').toLowerCase()
  if (/raffles|\brcc\b/.test(s)) return 'rcc'
  if (/income|ntuc/.test(s)) return 'income'
  if (/qbe|steadfast/.test(s)) return 'qbe'
  if (/singlife|singapore life/.test(s)) return 'singlife'
  if (/\baia\b/.test(s)) return 'aia'
  if (/cigna/.test(s)) return 'cigna'
  return null
}

export type Pick = { plan: string; note?: string | null }
type Pair = [entry: string, top: string]
type WardMap = Partial<Record<Ward, string | Pair | { plan: string | Pair; note: string }>>

/** Hospital plans by ward. A pair is [entry plan, top plan]. Plan codes as stored in gb_rates. */
const HOSPITAL: Record<InsurerKey, WardMap> = {
  rcc: {
    G4: 'Plan 6 (GRH 4-bed)', G1: 'Plan 5 (GRH 1-bed)', P4: 'Plan 4 (PTE 4-bed)', P2: 'Plan 3 (PTE 2-bed)',
    P1: ['Plan 2A (PTE 1-bed)', 'Plan 1 (PTE 1-bed)'],
  },
  income: {
    G4: 'Plan 5', G1: 'Plan 3', P4: 'Plan 4',
    P2: { plan: ['Plan 2', 'Plan 1'], note: 'No 2-bed plan; priced private 1-bed' },
    P1: ['Plan 2', 'Plan 1'],
  },
  qbe: {
    // QBE sells Plan 5 for government 4-bed only.
    G4: ['Plan 5 · Government 4-bedded', 'Plan 1 · Government 4-bedded'],
    G1: ['Plan 4 · Government 1-bedded', 'Plan 1 · Government 1-bedded'],
    P4: ['Plan 4 · Private 4-bedded', 'Plan 1 · Private 4-bedded'],
    P2: { plan: ['Plan 4 · Private 1-bedded', 'Plan 1 · Private 1-bedded'], note: 'No 2-bed plan; priced private 1-bed' },
    P1: ['Plan 4 · Private 1-bedded', 'Plan 1 · Private 1-bedded'],
  },
  singlife: {
    G4: 'Plan 1 (Govt/Restr)', G1: 'Plan 2 (Govt/Restr)', P4: 'Plan 3 (Pte 4-bed)', P2: 'Plan 4 (Pte 2-bed)',
    P1: ['Plan 5 (Pte 1-bed)', 'Plan 6 (Pte 1-bed)'],
  },
  aia: {
    G4: { plan: 'PLAN 1', note: 'No government-hospital plan for local staff; priced private 4-bed' },
    G1: { plan: 'PLAN 1', note: 'No government-hospital plan for local staff; priced private 4-bed' },
    P4: 'PLAN 1', P2: 'PLAN 2', P1: ['PLAN 3', 'PLAN 4'],
  },
  cigna: {
    // Cigna Care Connect 1.0 is private hospital on every tier; the tiers differ by limits.
    G4: { plan: ['Executive', 'Prestige'], note: 'Private hospital on every Cigna tier' },
    G1: { plan: ['Executive', 'Prestige'], note: 'Private hospital on every Cigna tier' },
    P4: { plan: ['Executive', 'Prestige'], note: 'Private hospital on every Cigna tier' },
    P2: { plan: ['Executive', 'Prestige'], note: 'Private hospital on every Cigna tier' },
    P1: ['Executive', 'Prestige'],
  },
}

/** Major medical where sold separately, keyed by the hospital plan it must match. */
const GMM_FOR: Partial<Record<InsurerKey, Record<string, string>>> = {
  rcc: { 'Plan 2A (PTE 1-bed)': 'Plan 2A/2B', 'Plan 3 (PTE 2-bed)': 'Plan 3', 'Plan 4 (PTE 4-bed)': 'Plan 4', 'Plan 5 (GRH 1-bed)': 'Plan 5', 'Plan 6 (GRH 4-bed)': 'Plan 6' },
  singlife: { 'Plan 1 (Govt/Restr)': 'Plan 1', 'Plan 2 (Govt/Restr)': 'Plan 2', 'Plan 3 (Pte 4-bed)': 'Plan 3', 'Plan 4 (Pte 2-bed)': 'Plan 4', 'Plan 5 (Pte 1-bed)': 'Plan 5' },
}
const GMM_BUNDLED: InsurerKey[] = ['income', 'aia']

/** Foreign-worker hospital plans: [with co-pay above S$15k, no co-pay]. */
const FW_HOSPITAL: Partial<Record<InsurerKey, { product?: RegExp; plan: string }>> = {
  income: { plan: 'Plan 7' },
  aia: { product: /^GHS-FW$/i, plan: 'PLAN 2' },
}

const GP: Record<InsurerKey, { nil: string; copay: string | { plan: string; note: string } }> = {
  rcc: { nil: 'Plan 1 (no co-pay)', copay: 'Plan 1B ($10 co-pay)' },
  income: { nil: 'Plan 1', copay: 'Plan 2' },
  qbe: { nil: 'Plan 1', copay: 'Plan 2' },
  singlife: { nil: 'Plan 1', copay: { plan: 'Plan 1', note: 'No co-pay option; priced Plan 1' } },
  aia: { nil: 'PLAN 1', copay: 'PLAN 2' },
  cigna: { nil: 'Executive', copay: 'Executive' },
}
const SPECIALIST: Record<InsurerKey, Pair> = {
  rcc: ['Plan 3', 'Plan 1'], income: ['Plan 2', 'Plan 1'], qbe: ['Plan 3', 'Plan 1'], singlife: ['Plan 1', 'Plan 6'], aia: ['PLAN 2', 'PLAN 4'], cigna: ['Executive', 'Prestige'],
}
const DENTAL: Record<InsurerKey, Pair> = {
  rcc: ['Plan 3', 'Plan 1'], income: ['Plan 2', 'Plan 1'], qbe: ['Plan 3 · Panel', 'Plan 1 · Panel'], singlife: ['Plan 1', 'Plan 3'], aia: ['PLAN 1', 'PLAN 1'], cigna: ['Executive', 'Prestige'],
}

/** Sums assured where the plan code does not carry them. */
const SUMS: Partial<Record<InsurerKey, Partial<Record<'GPA' | 'GTL' | 'GCI', Record<string, number>>>>> = {
  income: {
    GPA: { 'Plan 1': 500000, 'Plan 2': 300000, 'Plan 3': 100000 },
    GTL: { 'Plan 1': 500000, 'Plan 2': 300000, 'Plan 3': 200000, 'Plan 4': 100000, 'Plan 5': 50000 },
    GCI: { 'Plan 1': 250000, 'Plan 2': 150000, 'Plan 3': 100000, 'Plan 4': 80000, 'Plan 5': 50000 },
  },
  qbe: { GPA: { 'Plan 1': 500000, 'Plan 2': 200000, 'Plan 3': 150000, 'Plan 4': 50000 } },
  aia: {
    GPA: { 'PLAN 1': 50000, 'PLAN 2': 80000, 'PLAN 3': 120000, 'PLAN 4': 180000, 'PLAN 5': 250000, 'PLAN 6': 500000 },
    GTL: { 'PLAN 1': 50000, 'PLAN 2': 80000, 'PLAN 3': 120000, 'PLAN 4': 180000, 'PLAN 5': 250000, 'PLAN 6': 500000 },
    GCI: { 'PLAN 1': 25000, 'PLAN 2': 40000, 'PLAN 3': 60000, 'PLAN 4': 90000, 'PLAN 5': 125000, 'PLAN 6': 250000 },
  },
}

export function sumOf(ins: InsurerKey, cover: 'GPA' | 'GTL' | 'GCI', plan: string): number | null {
  const fixed = SUMS[ins]?.[cover]?.[plan]
  if (fixed != null) return fixed
  const m = /\$\s?(\d+(?:\.\d+)?)\s?k\b/i.exec(plan)
  return m ? Math.round(Number(m[1]) * 1000) : null
}

/** Nearest sum assured; a tie goes to the larger sum. */
export function nearestSum(ins: InsurerKey, cover: 'GPA' | 'GTL' | 'GCI', plans: string[], want: number): Pick | null {
  const priced = plans.map(p => ({ p, v: sumOf(ins, cover, p) })).filter((x): x is { p: string; v: number } => x.v != null)
  if (!priced.length) return null
  priced.sort((a, b) => Math.abs(a.v - want) - Math.abs(b.v - want) || b.v - a.v)
  const hit = priced[0]
  return { plan: hit.p, note: hit.v === want ? null : `Nearest sum S$${(hit.v / 1000).toLocaleString('en-SG')}k` }
}

const one = (x: string | Pair, level: Level) => (Array.isArray(x) ? (level === 'top' ? x[1] : x[0]) : x)

/** A rate table as the ladder needs it: its products and the plans each one sells. */
export type TableShape = { id: string; insurer_name: string; products: { code: string; plans: string[] }[] }

export type CoverKey = 'GHS' | 'EMM' | 'GOPC' | 'GOSC' | 'GD' | 'GPA' | 'GTL' | 'GCI'
export const COVER_LABEL: Record<CoverKey, string> = {
  GHS: 'Hospital & surgical', EMM: 'Major medical', GOPC: 'GP', GOSC: 'Specialist', GD: 'Dental', GPA: 'Personal accident', GTL: 'Term life', GCI: 'Critical illness',
}
export const MEDICAL_COVERS: CoverKey[] = ['GHS', 'EMM', 'GOPC', 'GOSC', 'GD']

/** One line of the plan grid: the plan chosen for a cover at one insurer, or why there is none. */
export type GridCell = { cover: CoverKey; product: string | null; plan: string | null; note: string | null; none?: string | null }

function productFor(t: TableShape, codes: CoverKey[], exact = false): { code: string; plans: string[] } | null {
  // A product counts when it is exactly these covers (or, not exact, includes the first one).
  for (const p of t.products) {
    const c = resolveProduct(p.code).codes as string[]
    const norm = c.map(x => (x === 'GADD' ? 'GPA' : x))
    if (exact ? norm.length === codes.length && codes.every(k => norm.includes(k)) : norm.length === 1 && norm[0] === codes[0]) return p
  }
  return null
}

/**
 * The plans one rate table offers for a requirement: one cell per cover asked for.
 * `fw` = the category is Work Permit / S Pass holders.
 */
export function planGrid(req: Requirement, t: TableShape, fw = false): GridCell[] {
  const ins = insurerKey(t.insurer_name)
  const cells: GridCell[] = []
  if (!ins) return cells
  const has = (p: { plans: string[] } | null, plan: string | null) => !!p && !!plan && p.plans.includes(plan)
  const push = (cover: CoverKey, product: { code: string; plans: string[] } | null, pick: Pick | null, noneWhy: string) => {
    if (!product || !pick) { cells.push({ cover, product: product?.code ?? null, plan: null, note: null, none: noneWhy }); return }
    if (!has(product, pick.plan)) { cells.push({ cover, product: product.code, plan: null, note: null, none: `${pick.plan} is not in the rate table` }); return }
    cells.push({ cover, product: product.code, plan: pick.plan, note: pick.note ?? null })
  }

  // Hospital
  let hospitalPlan: string | null = null
  if (req.ward) {
    const fwRule = fw ? FW_HOSPITAL[ins] : undefined
    if (fwRule) {
      const product = fwRule.product ? t.products.find(p => fwRule.product!.test(p.code)) ?? null : productFor(t, ['GHS'])
      push('GHS', product, { plan: fwRule.plan, note: 'Foreign-worker plan (Work Permit, S Pass)' }, 'Not offered')
    } else {
      const ghs = productFor(t, ['GHS']) ?? productFor(t, ['GHS', 'EMM'], true)
      const w = HOSPITAL[ins][req.ward]
      const pick = w == null ? null : typeof w === 'object' && !Array.isArray(w) ? { plan: one(w.plan, req.wardLevel), note: w.note } : { plan: one(w, req.wardLevel), note: null }
      if (pick && fw) pick.note = [pick.note, 'No foreign-worker plan; priced the standard plan'].filter(Boolean).join('. ')
      push('GHS', ghs, pick, 'Not offered')
      hospitalPlan = pick?.plan ?? null
    }
  }

  // Major medical
  if (req.gmm && req.ward) {
    if (GMM_BUNDLED.includes(ins)) cells.push({ cover: 'EMM', product: null, plan: null, note: null, none: 'Included in hospital cover' })
    else {
      const gmm = productFor(t, ['EMM'])
      const plan = hospitalPlan ? GMM_FOR[ins]?.[hospitalPlan] ?? null : null
      push('EMM', gmm, plan ? { plan } : null, gmm ? 'No major medical for this hospital plan' : 'Not offered')
    }
  }

  // Outpatient. AIA and Singlife price GP and specialist together in one rider when both are taken
  // (AIA "GP + SP", Singlife "GP, SP & DXL"): the specialist plan carries the GP benefit, so GP is
  // not added on top.
  const needsBase = (cover: CoverKey) => !req.ward && ['rcc', 'income'].includes(ins) ? `${COVER_LABEL[cover]} needs hospital cover` : null
  if (ins === 'aia' && req.gp && req.sp) {
    const product = t.products.find(p => (req.gp === 'copay' ? /S\$5\s*\+\s*SP/i : /S\$0\s*\+\s*SP/i).test(p.code)) ?? null
    push('GOSC', product, { plan: one(SPECIALIST.aia, req.sp), note: null }, 'Not offered')
    cells.push({ cover: 'GOPC', product: null, plan: null, note: null, none: 'Included in the GP + specialist rider' })
  } else if (ins === 'singlife' && req.gp && req.sp) {
    push('GOSC', productFor(t, ['GOSC']), { plan: one(SPECIALIST.singlife, req.sp), note: null }, 'Not offered')
    cells.push({ cover: 'GOPC', product: null, plan: null, note: null, none: 'Included in the GP, specialist and diagnostics rider' })
  } else {
    if (req.gp) {
      const base = needsBase('GOPC')
      const g = GP[ins][req.gp]
      const pick = typeof g === 'string' ? { plan: g } : g
      if (base) cells.push({ cover: 'GOPC', product: null, plan: null, note: null, none: base })
      else push('GOPC', productFor(t, ['GOPC']) ?? productFor(t, ['GOPC', 'GOSC'], true), pick, 'Not offered')
    }
    if (req.sp) {
      const base = needsBase('GOSC') ?? (ins === 'rcc' && !req.gp ? 'Specialist needs GP cover' : null)
      if (base) cells.push({ cover: 'GOSC', product: null, plan: null, note: null, none: base })
      else push('GOSC', productFor(t, ['GOSC']) ?? productFor(t, ['GOPC', 'GOSC'], true), { plan: one(SPECIALIST[ins], req.sp) }, 'Not offered')
    }
  }
  if (req.dental) {
    const base = needsBase('GD')
    if (base) cells.push({ cover: 'GD', product: null, plan: null, note: null, none: base })
    else push('GD', productFor(t, ['GD']), { plan: one(DENTAL[ins], req.dental), note: ins === 'aia' ? 'One dental plan' : null }, 'Not offered')
  }

  // Sums assured: employees only.
  if (req.pa) {
    const p = productFor(t, ['GPA'])
    push('GPA', p, p ? nearestSum(ins, 'GPA', p.plans, req.pa) : null, 'Not offered')
  }
  let gtlPick: Pick | null = null
  if (req.gtl) {
    const p = productFor(t, ['GTL'])
    gtlPick = p ? nearestSum(ins, 'GTL', p.plans, req.gtl) : null
    if (!(ins === 'aia' && req.gci)) push('GTL', p, gtlPick, 'Not offered')
  }
  if (req.gci) {
    if (ins === 'aia') {
      // AIA sells critical illness only with term life, priced as one product on the same plan.
      const bundle = productFor(t, ['GTL', 'GCI'], true)
      if (!req.gtl || !gtlPick) cells.push({ cover: 'GCI', product: null, plan: null, note: null, none: 'Critical illness needs term life' })
      else {
        const ci = sumOf('aia', 'GCI', gtlPick.plan)
        push('GTL', bundle, { plan: gtlPick.plan, note: [gtlPick.note, `With critical illness S$${((ci ?? 0) / 1000)}k`].filter(Boolean).join('. ') }, 'Not offered')
      }
    } else if (ins === 'income') {
      // Income's critical illness is a rider on term life with the same plan number.
      const p = productFor(t, ['GCI'])
      if (!req.gtl || !gtlPick) cells.push({ cover: 'GCI', product: p?.code ?? null, plan: null, note: null, none: 'Critical illness needs term life' })
      else {
        const ci = sumOf('income', 'GCI', gtlPick.plan)
        push('GCI', p, { plan: gtlPick.plan, note: ci !== req.gci ? `Follows the term life plan: S$${((ci ?? 0) / 1000)}k` : null }, 'Not offered')
      }
    } else {
      const p = productFor(t, ['GCI'])
      if (ins === 'rcc' && !req.gtl) cells.push({ cover: 'GCI', product: p?.code ?? null, plan: null, note: null, none: 'Critical illness needs term life' })
      else push('GCI', p, p ? nearestSum(ins, 'GCI', p.plans, req.gci) : null, 'Not offered')
    }
  }
  return cells
}

/** Broker overrides, keyed `${rate_table_id}|${cover}` → plan code ('' = none). */
export type Overrides = Record<string, string>

export type CategoryInput = { name: string; requirement: Requirement; overrides?: Overrides }

/** A census member as the ladder needs it. */
export type LadderMember = { category: string; relationship: string; work_pass?: string | null }
export const isDependant = (relationship: string) => /spouse|child|dependa|dependent|son|daughter|wife|husband|partner/i.test(relationship)
export const isForeignWorker = (pass: string | null | undefined) => /work\s*permit|\bwp\b|s\s*pass|\bsp\b/i.test(String(pass ?? ''))

/** The engine category a member is priced under: its category, split by dependants and foreign workers. */
export function engineCategory(m: LadderMember): string {
  return `${m.category}${isDependant(m.relationship) ? ' · dependants' : isForeignWorker(m.work_pass) ? ' · foreign workers' : ''}`
}

export type CategoryMap = Record<string, Record<string, Record<string, string>>>

/**
 * The category map computeQuote takes, for every table and every category. Dependants of a
 * category get its medical covers (or none); foreign workers get the foreign-worker hospital plan.
 */
export function buildCategoryMap(categories: CategoryInput[], tables: TableShape[], members: LadderMember[]): { map: CategoryMap; products: string[]; grids: Record<string, Record<string, GridCell[]>> } {
  const map: CategoryMap = {}
  const products = new Set<string>()
  const grids: Record<string, Record<string, GridCell[]>> = {}
  const used = new Set(members.map(engineCategory))
  for (const t of tables) {
    map[t.id] = {}
    grids[t.id] = {}
    for (const c of categories) {
      const variants: [string, boolean, boolean][] = [[c.name, false, false], [`${c.name} · dependants`, true, false], [`${c.name} · foreign workers`, false, true]]
      for (const [engineName, dep, fw] of variants) {
        if (!used.has(engineName) && engineName !== c.name) continue
        const cells = planGrid(c.requirement, t, fw).map(cell => {
          const key = `${t.id}|${cell.cover}`
          const o = c.overrides?.[key]
          if (o === undefined || fw) return cell
          return o === '' ? { ...cell, plan: null, none: 'Removed by broker', note: null } : { ...cell, plan: o, note: 'Changed by broker', none: null }
        })
        if (engineName === c.name) grids[t.id][c.name] = cells
        if (dep && c.requirement.deps === 'none') continue
        for (const cell of cells) {
          if (!cell.plan || !cell.product) continue
          if (dep && !MEDICAL_COVERS.includes(cell.cover)) continue
          map[t.id][cell.product] = { ...(map[t.id][cell.product] ?? {}), [engineName]: cell.plan }
          products.add(cell.product)
        }
      }
    }
  }
  return { map, products: [...products], grids }
}
