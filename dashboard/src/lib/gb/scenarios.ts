/**
 * Scenarios A, B, C: three requirements built from what a client thread says, priced by the same
 * engine as the plan builder. Pure; tested in src/__tests__/gb-scenarios.test.ts.
 *
 *   A  Like for like (renewal) or As briefed (new business): the current plan, or the brief, as
 *      a requirement. Unstated facts take the defaults (private 1-bed, entry tiers, dependants on
 *      medical covers).
 *   B  Lower cost: A with every tiered cover one step down (limit tier, specialist, dental; major
 *      medical off). Covers the client called optional come off. When A is already at the entry
 *      tier the ward steps down one notch, unless the ward is a must-have.
 *   C  Enhanced: A with the client's wishes applied (a cover added, a tier or sum raised). With no
 *      wish stated, every tiered cover steps up and major medical is added.
 *
 * Insurer flags: an insurer the client ruled out is priced and marked excluded, never dropped;
 * a preferred one is marked; the budget, when stated, marks each total within or over.
 *
 * The brief that feeds this is the model's read of the whole thread, made safe by normaliseBrief
 * (src/lib/gb/brief.ts). Nothing here calls a model or the database.
 */
import { DEFAULT_REQUIREMENT, insurerKey, type CoverKey, type InsurerKey, type Requirement, type Ward } from './ladder'

export type ScenarioKey = 'A' | 'B' | 'C'

export type WishChange = 'add' | 'up' | 'down' | 'remove'
export type Wish = { cover: CoverKey | 'other'; change: WishChange; detail: string | null; sum?: number | null }

/** What the thread says, as facts the scenario rules can act on. */
export type Brief = {
  company: string | null
  basis: 'new_business' | 'renewal'
  currentInsurer: string | null
  /** The current plan (renewal) or the brief (new business), as a requirement. Missing facts stay unset. */
  current: Partial<Requirement>
  currentPlanText: string | null
  /** Expiring annual premium in S$, net of GST, when the thread states one. */
  expiringPremium: number | null
  /** Budget as an annual total in S$, and whether it was stated net of GST. */
  budget: number | null
  budgetText: string | null
  budgetNetOfGst: boolean | null
  /** Facts the client will not trade: 'ward', 'no_copay', 'dependants', 'gp', 'sp', 'dental', 'pa', 'gtl', 'gci'. */
  mustHaves: string[]
  wishes: Wish[]
  /** Covers the client called optional or nice-to-have (CoverKey). */
  optional: CoverKey[]
  excludeInsurers: string[]
  preferInsurers: string[]
  renewalDate: string | null
  effectiveDate: string | null
  /** What the thread has already settled, and what is still open. Facts, one line each. */
  decisions: string[]
  open: string[]
}

export type Scenario = { key: ScenarioKey; name: string; summary: string; requirement: Requirement; changes: string[] }

const WARD_DOWN: Record<Ward, Ward | null> = { P1: 'P2', P2: 'P4', P4: 'G1', G1: 'G4', G4: null }
const WARD_UP: Record<Ward, Ward | null> = { G4: 'G1', G1: 'P4', P4: 'P2', P2: 'P1', P1: null }
const SUM_STEPS: Record<'pa' | 'gtl' | 'gci', number[]> = {
  pa: [50_000, 100_000, 150_000, 200_000, 250_000, 300_000, 500_000],
  gtl: [50_000, 100_000, 200_000, 300_000, 500_000],
  gci: [25_000, 50_000, 100_000, 150_000, 250_000],
}

const WARD_TEXT: Record<Ward, string> = { P1: 'private 1-bed', P2: 'private 2-bed', P4: 'private 4-bed', G1: 'government 1-bed', G4: 'government 4-bed' }
const k = (n: number) => `S$${n >= 1000 ? `${Math.round(n / 1000)}k` : n}`

/** One line a broker reads: "Private 1-bed top limit · GP $0 · specialist top · dental top · PA S$200k · dependants medical". */
export function requirementSummary(r: Requirement): string {
  const parts: string[] = []
  parts.push(r.ward ? `${WARD_TEXT[r.ward]} ${r.wardLevel === 'top' ? 'top' : 'entry'} limit${r.gmm ? ' + major medical' : ''}` : 'no hospital cover')
  if (r.gp) parts.push(r.gp === 'nil' ? 'GP $0' : 'GP co-pay')
  if (r.sp) parts.push(`specialist ${r.sp}`)
  if (r.dental) parts.push(`dental ${r.dental}`)
  if (r.pa) parts.push(`PA ${k(r.pa)}`)
  if (r.gtl) parts.push(`life ${k(r.gtl)}`)
  if (r.gci) parts.push(`CI ${k(r.gci)}`)
  parts.push(r.deps === 'none' ? 'employees only' : 'dependants medical')
  return parts.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(' · ')
}

/** The brief's current plan over the defaults: scenario A. */
export function baseRequirement(brief: Brief): Requirement {
  const c = brief.current
  const def = (v: unknown) => v === undefined
  return {
    ward: def(c.ward) ? DEFAULT_REQUIREMENT.ward : c.ward ?? null,
    wardLevel: c.wardLevel ?? DEFAULT_REQUIREMENT.wardLevel,
    gmm: c.gmm ?? DEFAULT_REQUIREMENT.gmm,
    gp: def(c.gp) ? DEFAULT_REQUIREMENT.gp : c.gp ?? null,
    sp: def(c.sp) ? DEFAULT_REQUIREMENT.sp : c.sp ?? null,
    dental: def(c.dental) ? DEFAULT_REQUIREMENT.dental : c.dental ?? null,
    pa: c.pa ?? null, gtl: c.gtl ?? null, gci: c.gci ?? null,
    deps: c.deps ?? DEFAULT_REQUIREMENT.deps,
  }
}

const stepSum = (cover: 'pa' | 'gtl' | 'gci', v: number | null, dir: 1 | -1): number | null => {
  if (!v) return v
  const steps = SUM_STEPS[cover]
  const i = steps.findIndex(s => s >= v)
  const at = i < 0 ? steps.length - 1 : i
  const n = steps[at + dir]
  return n ?? v
}

/** Scenario B from A. Must-haves hold; optional covers come off; then one tier down everywhere. */
export function lowerCost(a: Requirement, brief: Brief): { requirement: Requirement; changes: string[] } {
  const r: Requirement = { ...a }
  const changes: string[] = []
  const must = new Set(brief.mustHaves)
  for (const o of brief.optional) {
    if (o === 'GD' && r.dental && !must.has('dental')) { r.dental = null; changes.push('Dental off (optional in the brief)') }
    if (o === 'EMM' && r.gmm) { r.gmm = false; changes.push('Major medical off (optional in the brief)') }
    if (o === 'GOSC' && r.sp && !must.has('sp')) { r.sp = null; changes.push('Specialist off (optional in the brief)') }
    if (o === 'GOPC' && r.gp && !must.has('gp')) { r.gp = null; changes.push('GP off (optional in the brief)') }
    if (o === 'GPA' && r.pa && !must.has('pa')) { r.pa = null; changes.push('Personal accident off (optional in the brief)') }
    if (o === 'GTL' && r.gtl && !must.has('gtl')) { r.gtl = null; r.gci = null; changes.push('Term life off (optional in the brief)') }
  }
  if (r.ward && r.wardLevel === 'top') { r.wardLevel = 'entry'; changes.push('Hospital limit at the entry tier') }
  if (r.gmm) { r.gmm = false; changes.push('Major medical off') }
  if (r.sp === 'top') { r.sp = 'entry'; changes.push('Specialist at the entry tier') }
  if (r.dental === 'top') { r.dental = 'entry'; changes.push('Dental at the entry tier') }
  if (!changes.length && r.ward && !must.has('ward')) {
    const down = WARD_DOWN[r.ward]
    if (down) { changes.push(`Ward ${WARD_TEXT[down]} (was ${WARD_TEXT[r.ward]})`); r.ward = down }
  }
  if (!changes.length) {
    for (const c of ['pa', 'gtl', 'gci'] as const) {
      const v = stepSum(c, r[c], -1)
      if (v !== r[c] && !must.has(c)) { changes.push(`${c.toUpperCase()} ${k(v!)} (was ${k(r[c]!)})`); r[c] = v; break }
    }
  }
  return { requirement: r, changes }
}

/** Scenario C from A: the wishes; with none, one tier up everywhere and major medical added. */
export function enhanced(a: Requirement, brief: Brief): { requirement: Requirement; changes: string[] } {
  const r: Requirement = { ...a }
  const changes: string[] = []
  for (const w of brief.wishes) {
    if (w.change === 'remove' || w.change === 'down') continue
    switch (w.cover) {
      case 'GHS':
        if (w.change === 'up') {
          if (r.ward && r.wardLevel === 'entry') { r.wardLevel = 'top'; changes.push('Hospital limit at the top tier') }
          else if (r.ward && WARD_UP[r.ward]) { changes.push(`Ward ${WARD_TEXT[WARD_UP[r.ward]!]} (was ${WARD_TEXT[r.ward]})`); r.ward = WARD_UP[r.ward] }
        }
        break
      case 'EMM': if (!r.gmm) { r.gmm = true; changes.push('Major medical added') } break
      case 'GOPC': if (!r.gp) { r.gp = 'nil'; changes.push('GP added, no co-pay') } else if (r.gp === 'copay' && w.change === 'up') { r.gp = 'nil'; changes.push('GP without co-pay') } break
      case 'GOSC': if (!r.sp) { r.sp = 'entry'; changes.push('Specialist added') } else if (r.sp === 'entry') { r.sp = 'top'; changes.push('Specialist at the top tier') } break
      case 'GD': if (!r.dental) { r.dental = w.change === 'up' ? 'top' : 'entry'; changes.push(`Dental added${w.detail ? ` (${w.detail})` : ''}`) } else if (r.dental === 'entry') { r.dental = 'top'; changes.push(`Dental at the top tier${w.detail ? ` (${w.detail})` : ''}`) } break
      case 'GPA': { const v = w.sum ?? (r.pa ? stepSum('pa', r.pa, 1) : 100_000); if (v !== r.pa) { changes.push(r.pa ? `PA ${k(v!)} (was ${k(r.pa)})` : `Personal accident ${k(v!)} added`); r.pa = v } break }
      case 'GTL': { const v = w.sum ?? (r.gtl ? stepSum('gtl', r.gtl, 1) : 100_000); if (v !== r.gtl) { changes.push(r.gtl ? `Term life ${k(v!)} (was ${k(r.gtl)})` : `Term life ${k(v!)} added`); r.gtl = v } break }
      case 'GCI': { const v = w.sum ?? (r.gci ? stepSum('gci', r.gci, 1) : 50_000); if (v !== r.gci) { changes.push(r.gci ? `Critical illness ${k(v!)} (was ${k(r.gci)})` : `Critical illness ${k(v!)} added`); r.gci = v } break }
      default: break
    }
  }
  if (!changes.length) {
    if (r.ward && r.wardLevel === 'entry') { r.wardLevel = 'top'; changes.push('Hospital limit at the top tier') }
    if (r.ward && !r.gmm) { r.gmm = true; changes.push('Major medical added') }
    if (r.sp === 'entry') { r.sp = 'top'; changes.push('Specialist at the top tier') }
    if (r.dental === 'entry') { r.dental = 'top'; changes.push('Dental at the top tier') }
    if (!changes.length && r.ward && WARD_UP[r.ward]) { changes.push(`Ward ${WARD_TEXT[WARD_UP[r.ward]!]} (was ${WARD_TEXT[r.ward]})`); r.ward = WARD_UP[r.ward] }
  }
  return { requirement: r, changes }
}

export function scenariosFor(brief: Brief): Scenario[] {
  const a = baseRequirement(brief)
  const b = lowerCost(a, brief)
  const c = enhanced(a, brief)
  return [
    { key: 'A', name: brief.basis === 'renewal' ? 'Like for like' : 'As briefed', summary: requirementSummary(a), requirement: a, changes: brief.currentPlanText ? [`From the thread: ${brief.currentPlanText}`] : ['Unstated facts at the defaults'] },
    { key: 'B', name: 'Lower cost', summary: requirementSummary(b.requirement), requirement: b.requirement, changes: b.changes },
    { key: 'C', name: 'Enhanced', summary: requirementSummary(c.requirement), requirement: c.requirement, changes: c.changes },
  ]
}

// ── Insurer flags ────────────────────────────────────────────────────────────────────────────────

export type PricedInsurer = { rate_table_id: string; insurer_name: string; insurer: InsurerKey; net: number; gst: number; total: number; missing: number; by_product: Record<string, number>; gaps?: { member: string; product: string; note: string }[] }
export type ScenarioInsurer = PricedInsurer & {
  /** The card that prices this effective date and basis; other cards of the same insurer are shown folded. */
  inForce: boolean
  excluded: boolean
  preferred: boolean
  current: boolean
  /** Against the stated budget, on the same GST footing. null when no budget. */
  withinBudget: boolean | null
}

const keysOf = (names: string[]) => new Set(names.map(n => insurerKey(n)).filter((x): x is InsurerKey => !!x))

export function flagInsurers(priced: PricedInsurer[], brief: Brief, inForceIds: Set<string>): ScenarioInsurer[] {
  const excluded = keysOf(brief.excludeInsurers), preferred = keysOf(brief.preferInsurers)
  const current = brief.currentInsurer ? insurerKey(brief.currentInsurer) : null
  return priced.map(p => ({
    ...p,
    inForce: inForceIds.has(p.rate_table_id),
    excluded: excluded.has(p.insurer),
    preferred: preferred.has(p.insurer),
    current: !!current && p.insurer === current,
    withinBudget: brief.budget == null ? null : (brief.budgetNetOfGst === false ? p.total : p.net) <= brief.budget,
  })).sort((a, b) => Number(b.inForce) - Number(a.inForce) || a.total - b.total)
}

/** The lowest complete, in-force, not-excluded total of a scenario; null when none qualifies. */
export function headline(insurers: ScenarioInsurer[]): ScenarioInsurer | null {
  return insurers.filter(i => i.inForce && !i.excluded && i.missing === 0).sort((a, b) => a.total - b.total)[0] ?? null
}

/** A thread subject that belongs to a benefits conversation even when the classifier filed it
 *  elsewhere: the claim history, the census, the member listing, the medical plan. */
export const isEbSubject = (subject: string | null | undefined): boolean =>
  /medical|benefit|census|member\s*list|employee\s*list|headcount|\bghs\b|\bgtl\b|dental|hospital|claim\s*(history|experience|report)|outpatient|\beb\b/i.test(String(subject ?? ''))
