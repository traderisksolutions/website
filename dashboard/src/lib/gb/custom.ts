/**
 * Customise: a client's numbers, resolved to the plan at each insurer that meets them.
 *
 * The first screen carries what a client says out loud: hospital type, ward, the limit (per stay
 * or a year), co-insurance, major medical, GP co-pay, specialist limit, dental limit, term life,
 * dependants. Critical illness and accident sit behind "more". The resolver picks, per cover and
 * per insurer, the lowest plan whose fact meets the number; where none does it takes the nearest
 * below and says so; where the insurer does not sell the shape (no government ward at AIA, no
 * 2-bed at Income or QBE) it takes the nearest shape and says so. Nothing here prices.
 *
 * Pure. Tested in src/__tests__/gb-custom.test.ts.
 */
import type { CoverKey, Requirement, Ward } from './ladder'
import type { GhsPlanFacts, LimitFacts } from './limit-facts'

export type CustomSpec = {
  hospital: 'private' | 'government'
  beds: 1 | 2 | 4
  limitKind: 'per_disability' | 'annual'
  /** S$: per stay for per_disability, per year for annual. */
  limit: number
  coins: 0 | 20 | 25
  /** Major medical limit in S$, or null for none. */
  gmm: number | null
  /** GP co-pay per visit in S$, or null for no GP cover. */
  gpCopay: number | null
  spLimit: number | null
  gdLimit: number | null
  gtl: number | null
  gci: number | null
  pa: number | null
  deps: 'medical' | 'none'
}

export const DEFAULT_CUSTOM: CustomSpec = { hospital: 'private', beds: 4, limitKind: 'per_disability', limit: 15_000, coins: 0, gmm: 60_000, gpCopay: 0, spLimit: 1_500, gdLimit: 500, gtl: 100_000, gci: null, pa: null, deps: 'medical' }

/** The ladder requirement that carries the covers; the overrides then fix the plans. */
export function customRequirement(s: CustomSpec): Requirement {
  const ward = `${s.hospital === 'government' ? 'G' : 'P'}${s.beds === 2 && s.hospital === 'private' ? '2' : s.beds === 1 ? '1' : '4'}` as Ward
  return {
    ward, wardLevel: s.limitKind === 'annual' ? 'top' : 'entry', gmm: !!s.gmm, gp: s.gpCopay == null ? null : s.gpCopay > 0 ? 'copay' : 'nil',
    sp: s.spLimit == null ? null : s.spLimit >= 2_000 ? 'top' : 'entry', dental: s.gdLimit == null ? null : s.gdLimit >= 800 ? 'top' : 'entry',
    pa: s.pa, gtl: s.gtl, gci: s.gci, deps: s.deps,
  }
}

const k = (n: number) => `S$${n.toLocaleString('en-SG')}`

/** The lowest plan whose limit meets `want`; else the highest below it, flagged. */
function meet<T extends { plan: string; limit: number | null }>(plans: T[], want: number, what: string, onlyOne = false): { pick: T | null; note: string | null } {
  const known = plans.filter(p => p.limit != null).sort((a, b) => a.limit! - b.limit!)
  if (!known.length) return { pick: null, note: null }
  // The insurer sells one plan for this cover: there is no choice to explain.
  if (onlyOne) return { pick: known[0], note: null }
  const up = known.find(p => p.limit! >= want)
  if (up) return { pick: up, note: null }
  const below = known[known.length - 1]
  return { pick: below, note: `${what}: nearest is ${k(below.limit!)}` }
}

export type CustomResolution = { overrides: Partial<Record<CoverKey, string>>; notes: string[] }

/** The plans at one insurer that meet the spec. */
export function resolveCustom(spec: CustomSpec, facts: LimitFacts): CustomResolution {
  const overrides: Partial<Record<CoverKey, string>> = {}
  const notes: string[] = []

  // Hospital: same type and ward and co-insurance where sold; the nearest shape otherwise.
  let pool = facts.ghs.filter(p => p.hospital === spec.hospital)
  if (!pool.length && facts.ghs.length) { pool = facts.ghs; notes.push(`no ${spec.hospital} hospital plan; ${pool[0].hospital ?? 'the other'} hospital priced`) }
  const bedsOrder: Record<1 | 2 | 4, (1 | 2 | 4)[]> = { 4: [4, 2, 1], 2: [2, 1, 4], 1: [1, 2, 4] }
  let byBeds: GhsPlanFacts[] = []
  for (const b of bedsOrder[spec.beds]) { byBeds = pool.filter(p => p.beds === b); if (byBeds.length) { if (b !== spec.beds) notes.push(`no ${spec.beds}-bed plan; ${b}-bed priced`); break } }
  if (!byBeds.length) byBeds = pool
  let byCoins = byBeds.filter(p => p.coins === spec.coins)
  if (!byCoins.length) { byCoins = byBeds.filter(p => p.coins === 0); if (byCoins.length && spec.coins) notes.push(`no ${spec.coins}% co-insurance plan; nil co-insurance priced`) }
  if (!byCoins.length) byCoins = byBeds
  let byKind = byCoins.filter(p => p.kind === spec.limitKind)
  if (!byKind.length) { byKind = byCoins; if (byKind.length) notes.push(spec.limitKind === 'annual' ? 'no annual-limit plan at this ward; per-disability plan priced' : 'no per-disability plan at this ward; annual-limit plan priced') }
  const ghs = meet(byKind, spec.limit, spec.limitKind === 'annual' ? 'annual limit' : 'per-stay limit', facts.ghs.length === 1)
  if (ghs.pick) { overrides.GHS = ghs.pick.plan; if (ghs.note) notes.push(ghs.note) }

  // Riders: the lowest plan that meets the number. Major medical pairs with the hospital plan at
  // the insurers that sell it as a rider, so it is left to the ladder and only noted.
  if (spec.gmm && facts.emm.length) {
    const m = meet(facts.emm, spec.gmm, 'major medical', facts.emm.length === 1)
    if (m.note) notes.push(m.note)
  }
  if (spec.spLimit != null && facts.gosc.length) { const m = meet(facts.gosc, spec.spLimit, 'specialist limit', facts.gosc.length === 1); if (m.pick) overrides.GOSC = m.pick.plan; if (m.note) notes.push(m.note) }
  if (spec.gdLimit != null && facts.gd.length) { const m = meet(facts.gd, spec.gdLimit, 'dental limit', facts.gd.length === 1); if (m.pick) overrides.GD = m.pick.plan; if (m.note) notes.push(m.note) }
  if (spec.gpCopay != null && facts.gopc.length) {
    const known = facts.gopc.filter(p => p.copay != null).sort((a, b) => a.copay! - b.copay!)
    const exact = known.find(p => p.copay === spec.gpCopay) ?? known.filter(p => p.copay! <= spec.gpCopay!).pop() ?? known[0]
    if (exact) { overrides.GOPC = exact.plan; if (exact.copay !== spec.gpCopay) notes.push(`GP co-pay: nearest is S$${exact.copay}`) }
  }
  return { overrides, notes }
}

/** One line a client reads: "Private 2-bed · S$20,000 per stay · major medical S$80,000 · GP S$0 · specialist S$2,000 · dental S$800 · life S$100,000 · dependants". */
export function customSummary(s: CustomSpec): string {
  const parts = [
    `${s.hospital === 'government' ? 'Government' : 'Private'} ${s.beds}-bed`,
    `${k(s.limit)} ${s.limitKind === 'annual' ? 'a year' : 'per stay'}${s.coins ? ` · ${s.coins}% co-insurance` : ''}`,
    s.gmm ? `major medical ${k(s.gmm)}` : null,
    s.gpCopay != null ? `GP S$${s.gpCopay}` : null,
    s.spLimit != null ? `specialist ${k(s.spLimit)}` : null,
    s.gdLimit != null ? `dental ${k(s.gdLimit)}` : null,
    s.gtl ? `life ${k(s.gtl)}` : null, s.gci ? `CI ${k(s.gci)}` : null, s.pa ? `PA ${k(s.pa)}` : null,
    s.deps === 'medical' ? 'dependants on medical' : 'employees only',
  ]
  return parts.filter(Boolean).join(' · ')
}
